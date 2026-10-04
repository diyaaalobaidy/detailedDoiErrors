<?php

/**
 * @file DetailedDoiErrorsPlugin.php
 *
 * Copyright (c) 2026
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class DetailedDoiErrorsPlugin
 *
 * @brief OJS 3.5 plugin to display detailed DOI submission error details from registration agency deposits and queue job failures.
 */

namespace APP\plugins\generic\detailedDoiErrors;

use APP\core\Application;
use APP\facades\Repo;
use APP\issue\Issue;
use APP\submission\Submission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use PKP\context\Context;
use PKP\core\PKPApplication;
use PKP\core\PKPRequest;
use PKP\doi\Doi;
use PKP\plugins\GenericPlugin;
use PKP\plugins\Hook;
use PKP\security\authorization\ContextAccessPolicy;
use PKP\security\authorization\PolicySet;
use PKP\security\authorization\RoleBasedHandlerOperationPolicy;
use PKP\security\authorization\UserRolesRequiredPolicy;
use PKP\security\Role;

class DetailedDoiErrorsPlugin extends GenericPlugin
{
    /**
     * @copydoc LazyLoadPlugin::getEnabled()
     */
    public function getEnabled($contextId = null)
    {
        return true;
    }

    /**
     * @copydoc LazyLoadPlugin::getCanEnable()
     */
    public function getCanEnable()
    {
        return true;
    }

    /**
     * @copydoc LazyLoadPlugin::getCanDisable()
     */
    public function getCanDisable()
    {
        return true;
    }

    /**
     * @copydoc LazyLoadPlugin::isSitePlugin()
     */
    public function isSitePlugin()
    {
        return true;
    }

    /**
     * @copydoc Plugin::register()
     */
    public function register($category, $path, $mainContextId = null)
    {
        $success = parent::register($category, $path, $mainContextId);

        if ($success) {
            $localePath = __DIR__ . '/locale';
            if (is_dir($localePath)) {
                \PKP\facades\Locale::registerPath($localePath);
            }

            if (Application::isUnderMaintenance()) {
                return true;
            }

            // Hook into TemplateManager to inject JS/CSS on backend pages
            Hook::add('TemplateManager::display', $this->callbackTemplateDisplay(...));
            Hook::add('Template::Layout::Backend::HeaderActions', $this->callbackHeaderActions(...));

            // Hook into APIHandler for dois to register diagnostic endpoints
            Hook::add('APIHandler::endpoints::dois', $this->callbackRegisterApiEndpoints(...));

            // Hook into DoiListPanel configuration to provide plugin API endpoint and locales
            Hook::add('DoiListPanel::setConfig', $this->callbackDoiListPanelConfig(...));
        }

        return $success;
    }

    /**
     * @copydoc Plugin::getDisplayName()
     */
    public function getDisplayName()
    {
        return __('plugins.generic.detailedDoiErrors.displayName');
    }

    /**
     * @copydoc Plugin::getDescription()
     */
    public function getDescription()
    {
        return __('plugins.generic.detailedDoiErrors.description');
    }

    /**
     * Hook callback: APIHandler::endpoints::dois
     * Adds custom API endpoints for retrieving comprehensive DOI error and failed job diagnostics.
     */
    public function callbackRegisterApiEndpoints(string $hookName, array $args): bool
    {
        $controller = $args[0];
        $apiHandler = $args[1];

        // Register route: GET {context}/api/v1/dois/diagnostics/{itemType}/{itemId}
        $apiHandler->addRoute(
            'GET',
            'diagnostics/{itemType}/{itemId}',
            [$this, 'apiGetDiagnostics'],
            'detailedDoiErrors.getDiagnostics',
            [Role::ROLE_ID_SITE_ADMIN, Role::ROLE_ID_MANAGER]
        );

        return Hook::CONTINUE;
    }

    /**
     * API Handler method: returns structured diagnostic details for submission or issue.
     */
    public function apiGetDiagnostics(Request $request): JsonResponse
    {
        $itemType = (string) $request->route('itemType');
        $itemId = (int) $request->route('itemId');

        $context = Application::get()->getRequest()->getContext();
        $contextId = $context ? $context->getId() : null;

        $doiDetails = [];
        $failedJobs = [];

        // 1. Fetch DOI objects and deposit details
        if ($itemType === 'submission') {
            $submission = Repo::submission()->get($itemId);
            if (!$submission || ($contextId && $submission->getData('contextId') != $contextId)) {
                return response()->json(['error' => 'Submission not found'], Response::HTTP_NOT_FOUND);
            }

            $doiIds = Repo::doi()->getDoisForSubmission($itemId);
            foreach ($doiIds as $doiId) {
                $doi = Repo::doi()->get($doiId);
                if ($doi) {
                    $doiDetails[] = $this->_formatDoiDetails($doi, $submission);
                }
            }

            // 2. Fetch failed jobs matching submission
            $failedJobs = $this->_findFailedJobsForSubmission($itemId);

        } elseif ($itemType === 'issue') {
            $issue = Repo::issue()->get($itemId);
            if (!$issue || ($contextId && $issue->getJournalId() != $contextId)) {
                return response()->json(['error' => 'Issue not found'], Response::HTTP_NOT_FOUND);
            }

            $doiIds = Repo::doi()->getDoisForIssue($itemId, true);
            foreach ($doiIds as $doiId) {
                $doi = Repo::doi()->get($doiId);
                if ($doi) {
                    $doiDetails[] = $this->_formatDoiDetails($doi, $issue);
                }
            }

            // 2. Fetch failed jobs matching issue
            $failedJobs = $this->_findFailedJobsForIssue($itemId);
        } else {
            return response()->json(['error' => 'Invalid item type'], Response::HTTP_BAD_REQUEST);
        }

        return response()->json([
            'itemType' => $itemType,
            'itemId' => $itemId,
            'doiDetails' => $doiDetails,
            'failedJobs' => $failedJobs,
        ], Response::HTTP_OK);
    }

    /**
     * Format a DOI entity and extract agency errors and raw responses.
     */
    private function _formatDoiDetails(Doi $doi, $pubObject): array
    {
        $statusMap = [
            Doi::STATUS_UNREGISTERED => 'Unregistered',
            Doi::STATUS_SUBMITTED => 'Submitted',
            Doi::STATUS_REGISTERED => 'Registered',
            Doi::STATUS_ERROR => 'Error',
            Doi::STATUS_STALE => 'Stale',
        ];

        $statusString = $statusMap[$doi->getStatus()] ?? 'Unknown';

        // Known error/batch keys for registration agencies
        $possibleFailedKeys = [
            'crossref_failedMsg',
            'crossrefExportPlugin_failedMsg',
            'datacite_failedMsg',
            'dataciteExportPlugin_failedMsg',
            'medra_failedMsg',
        ];

        $possibleBatchKeys = [
            'crossref_batchId',
            'crossrefExportPlugin_batchId',
            'datacite_batchId',
            'dataciteExportPlugin_batchId',
        ];

        $failedMsg = null;
        $batchId = null;

        foreach ($possibleFailedKeys as $key) {
            $val = $doi->getData($key);
            if (!empty($val)) {
                $failedMsg = $val;
                break;
            }
        }

        foreach ($possibleBatchKeys as $key) {
            $val = $doi->getData($key);
            if (!empty($val)) {
                $batchId = $val;
                break;
            }
        }

        // Parse XML errors if present in failedMsg
        $parsedErrors = $this->_parseAgencyErrors($failedMsg);

        return [
            'doiId' => $doi->getId(),
            'doi' => $doi->getData('doi'),
            'status' => $doi->getStatus(),
            'statusString' => $statusString,
            'registrationAgency' => $doi->getData('registrationAgency') ?? 'Not specified',
            'batchId' => $batchId,
            'rawFailedMessage' => $failedMsg,
            'parsedErrors' => $parsedErrors,
        ];
    }

    /**
     * Parse structured error messages from XML / JSON deposit error payloads.
     */
    private function _parseAgencyErrors(?string $rawMessage): array
    {
        if (empty($rawMessage)) {
            return [];
        }

        $parsed = [];

        // Try parsing XML if content contains XML tags
        if (str_contains($rawMessage, '<') && str_contains($rawMessage, '>')) {
            libxml_use_internal_errors(true);
            $xml = simplexml_load_string($rawMessage);
            if ($xml !== false) {
                // Crossref response format: <record_diagnostic status="Failure">
                $diagnostics = $xml->xpath('//record_diagnostic');
                if (!empty($diagnostics)) {
                    foreach ($diagnostics as $diag) {
                        $parsed[] = [
                            'type' => (string) ($diag['status'] ?? 'Failure'),
                            'message' => trim((string) $diag),
                        ];
                    }
                }

                // Crossref msg tag
                $msgNodes = $xml->xpath('//msg');
                if (!empty($msgNodes)) {
                    foreach ($msgNodes as $m) {
                        $val = trim((string) $m);
                        if (!empty($val) && !in_array($val, array_column($parsed, 'message'))) {
                            $parsed[] = [
                                'type' => 'Agency Message',
                                'message' => $val,
                            ];
                        }
                    }
                }
            }
            libxml_clear_errors();
        }

        // Try parsing JSON if content looks like JSON
        if (empty($parsed) && (str_starts_with(trim($rawMessage), '{') || str_starts_with(trim($rawMessage), '['))) {
            $json = json_decode($rawMessage, true);
            if (is_array($json)) {
                if (isset($json['errors']) && is_array($json['errors'])) {
                    foreach ($json['errors'] as $err) {
                        $parsed[] = [
                            'type' => $err['title'] ?? ($err['status'] ?? 'Error'),
                            'message' => $err['detail'] ?? ($err['message'] ?? json_encode($err)),
                        ];
                    }
                } elseif (isset($json['message'])) {
                    $parsed[] = [
                        'type' => 'Error',
                        'message' => $json['message'],
                    ];
                }
            }
        }

        return $parsed;
    }

    /**
     * Search failed jobs database table for jobs associated with a submission ID.
     */
    private function _findFailedJobsForSubmission(int $submissionId): array
    {
        return $this->_queryFailedJobs([
            'submissionId' => $submissionId,
            'classNames' => [
                'DepositSubmission',
                'PKP\\jobs\\doi\\DepositSubmission',
            ],
        ]);
    }

    /**
     * Search failed jobs database table for jobs associated with an issue ID.
     */
    private function _findFailedJobsForIssue(int $issueId): array
    {
        return $this->_queryFailedJobs([
            'issueId' => $issueId,
            'classNames' => [
                'DepositIssue',
                'APP\\jobs\\doi\\DepositIssue',
            ],
        ]);
    }

    /**
     * Query failed_jobs table and filter matching payload.
     */
    private function _queryFailedJobs(array $criteria): array
    {
        $results = [];

        try {
            $jobs = DB::table('failed_jobs')
                ->orderBy('failed_at', 'desc')
                ->limit(100)
                ->get();

            foreach ($jobs as $job) {
                $payload = json_decode($job->payload, true);
                if (!$payload) {
                    continue;
                }

                $commandName = $payload['displayName'] ?? ($payload['data']['commandName'] ?? '');
                $matchesClass = false;

                if (!empty($criteria['classNames'])) {
                    foreach ($criteria['classNames'] as $cn) {
                        if (str_contains($commandName, $cn) || (isset($payload['data']['command']) && str_contains($payload['data']['command'], $cn))) {
                            $matchesClass = true;
                            break;
                        }
                    }
                }

                if (!$matchesClass) {
                    continue;
                }

                $matchesId = false;
                $commandSerialized = $payload['data']['command'] ?? null;

                // Inspect serialized object or payload parameters
                if (isset($criteria['submissionId'])) {
                    $searchId = $criteria['submissionId'];
                    if ($commandSerialized) {
                        if (preg_match('/submissionId";i:' . $searchId . ';/', $commandSerialized) ||
                            preg_match('/"submissionId":' . $searchId . '/', $job->payload)) {
                            $matchesId = true;
                        }
                    }
                } elseif (isset($criteria['issueId'])) {
                    $searchId = $criteria['issueId'];
                    if ($commandSerialized) {
                        if (preg_match('/issueId";i:' . $searchId . ';/', $commandSerialized) ||
                            preg_match('/"issueId":' . $searchId . '/', $job->payload)) {
                            $matchesId = true;
                        }
                    }
                }

                if ($matchesId) {
                    // Extract short exception message and full trace
                    $exceptionFull = $job->exception ?? '';
                    $exceptionShort = preg_replace('/\s+/', ' ', trim(explode('Stack trace', $exceptionFull)[0]));

                    $results[] = [
                        'id' => $job->id,
                        'queue' => $job->queue,
                        'connection' => $job->connection,
                        'failedAt' => $job->failed_at,
                        'jobName' => $commandName,
                        'exceptionMessage' => $exceptionShort,
                        'exceptionTrace' => $exceptionFull,
                    ];
                }
            }
        } catch (\Throwable $e) {
            error_log('DetailedDoiErrorsPlugin queryFailedJobs error: ' . $e->getMessage());
        }

        return $results;
    }

    /**
     * Hook callback: DoiListPanel::setConfig
     * Injects diagnostic configuration and URLs into the DoiListPanel Vue component.
     */
    public function callbackDoiListPanelConfig(string $hookName, array $args): bool
    {
        $config = &$args[0];

        $request = Application::get()->getRequest();
        $context = $request->getContext();
        $contextPath = $context ? $context->getPath() : Application::SITE_CONTEXT_PATH;

        $dispatcher = $request->getDispatcher();
        $diagnosticsApiUrl = $dispatcher->url(
            $request,
            PKPApplication::ROUTE_API,
            $contextPath,
            'dois/diagnostics'
        );

        $config['detailedDoiErrors'] = [
            'apiUrl' => $diagnosticsApiUrl,
            'labels' => [
                'buttonLabel' => __('plugins.generic.detailedDoiErrors.buttonLabel'),
                'modalTitle' => __('plugins.generic.detailedDoiErrors.modalTitle'),
                'sectionDepositDetails' => __('plugins.generic.detailedDoiErrors.sectionDepositDetails'),
                'sectionJobDetails' => __('plugins.generic.detailedDoiErrors.sectionJobDetails'),
                'noFailedJobs' => __('plugins.generic.detailedDoiErrors.noFailedJobs'),
                'noDepositErrors' => __('plugins.generic.detailedDoiErrors.noDepositErrors'),
                'agency' => __('plugins.generic.detailedDoiErrors.agency'),
                'batchId' => __('plugins.generic.detailedDoiErrors.batchId'),
                'failedAt' => __('plugins.generic.detailedDoiErrors.failedAt'),
                'jobId' => __('plugins.generic.detailedDoiErrors.jobId'),
                'queue' => __('plugins.generic.detailedDoiErrors.queue'),
                'exception' => __('plugins.generic.detailedDoiErrors.exception'),
                'stackTrace' => __('plugins.generic.detailedDoiErrors.stackTrace'),
                'rawResponse' => __('plugins.generic.detailedDoiErrors.rawResponse'),
                'parsedErrors' => __('plugins.generic.detailedDoiErrors.parsedErrors'),
                'status' => __('plugins.generic.detailedDoiErrors.status'),
                'doi' => __('plugins.generic.detailedDoiErrors.doi'),
                'item' => __('plugins.generic.detailedDoiErrors.item'),
                'loading' => __('plugins.generic.detailedDoiErrors.loading'),
                'fetchError' => __('plugins.generic.detailedDoiErrors.fetchError'),
                'copyAll' => __('plugins.generic.detailedDoiErrors.copyAll'),
                'copied' => __('plugins.generic.detailedDoiErrors.copied'),
                'ok' => __('common.ok'),
                'close' => __('common.close'),
            ],
        ];

        return Hook::CONTINUE;
    }

    /**
     * Hook callback: Template::Layout::Backend::HeaderActions
     * Injects the plugin's JS and CSS into the backend header on DOI management pages.
     */
    public function callbackHeaderActions(string $hookName, array $args): bool
    {
        $request = Application::get()->getRequest();
        $page = $request->getRequestedPage();
        $op = $request->getRequestedOp();

        if ($page === 'dois' || ($page === 'management' && $op === 'dois')) {
            $baseUrl = $request->getBaseUrl();
            $pluginUrl = $baseUrl . '/' . $this->getPluginPath();

            $output = &$args[2] ?? $args[1] ?? null;
            $snippet = '<script type="text/javascript" src="' . htmlspecialchars($pluginUrl . '/js/detailedDoiErrors.js', ENT_QUOTES) . '"></script>' . "\n"
                     . '<style type="text/css">' . $this->_getCustomCss() . '</style>' . "\n";

            if (is_string($output)) {
                $output .= $snippet;
            } else {
                echo $snippet;
            }
        }

        return Hook::CONTINUE;
    }

    /**
     * Hook callback: TemplateManager::display
     * Injects the plugin's JavaScript file into the backend template.
     */
    public function callbackTemplateDisplay(string $hookName, array $args): bool
    {
        $templateMgr = $args[0];
        $template = (string) ($args[1] ?? '');

        // Inject on backend DOI management pages
        if ($template === 'management/dois.tpl' || str_contains($template, 'dois.tpl')) {
            $request = Application::get()->getRequest();
            $baseUrl = $request->getBaseUrl();
            $pluginUrl = $baseUrl . '/' . $this->getPluginPath();

            $templateMgr->addJavaScript(
                'detailedDoiErrorsJs',
                $pluginUrl . '/js/detailedDoiErrors.js',
                [
                    'priority' => \PKP\template\PKPTemplateManager::STYLE_SEQUENCE_LATE,
                    'contexts' => ['backend'],
                ]
            );

            $templateMgr->addHeader(
                'detailedDoiErrorsCss',
                '<style type="text/css">' . $this->_getCustomCss() . '</style>',
                ['contexts' => ['backend']]
            );
        }

        return Hook::CONTINUE;
    }

    /**
     * Return custom styling for dialog and action buttons.
     */
    private function _getCustomCss(): string
    {
        return "
            .detailed-doi-errors-modal { max-height: 80vh; overflow-y: auto; font-size: 0.9rem; }
            .detailed-doi-errors-modal h3 { font-size: 1.05rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25rem; }
            .detailed-doi-errors-modal h3:first-child { margin-top: 0; }
            .detailed-doi-errors-modal .diag-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.75rem; }
            .detailed-doi-errors-modal .diag-badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; font-size: 0.75rem; margin-right: 0.5rem; }
            .detailed-doi-errors-modal .diag-badge-error { background: #fee2e2; color: #b91c1c; }
            .detailed-doi-errors-modal .diag-badge-job { background: #fef3c7; color: #92400e; }
            .detailed-doi-errors-modal .diag-pre { background: #0f172a; color: #f8fafc; padding: 0.75rem; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 0.8rem; white-space: pre-wrap; word-break: break-all; margin-top: 0.5rem; max-height: 250px; }
            .detailed-doi-errors-modal .diag-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.75rem; font-size: 0.85rem; margin-bottom: 0.5rem; }
            .detailed-doi-errors-modal .diag-label { font-weight: 600; color: #475569; }
            .detailed-doi-errors-modal .diag-actions { margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.5rem; }
            .detailed-doi-errors-btn { display: inline-flex; align-items: center; margin-left: 0.5rem; color: #dc2626; border-color: #fca5a5; font-size: 0.85rem; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; }
            .detailed-doi-errors-btn:hover { background-color: #fef2f2; }
            .detailed-doi-errors-btn i, .detailed-doi-errors-btn svg { margin-right: 0.25rem; }
        ";
    }
}
