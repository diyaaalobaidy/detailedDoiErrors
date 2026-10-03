/**
 * detailedDoiErrors.js
 *
 * Frontend script for Detailed DOI Errors plugin in OJS 3.5.
 * Extends the DOI Management page by adding detailed diagnostic modals
 * with full deposit error details and queue job failure traces.
 */
(function ($) {
    'use strict';

    if (typeof window.pkp === 'undefined') {
        window.pkp = {};
    }

    /**
     * Show Modal Dialog with formatted diagnostics
     */
    function showDiagnosticsModal(item, diagnostics, config) {
        var labels = (config && config.labels) || {};
        var title = (labels.modalTitle || 'DOI Submission Error & Failure Diagnostics') + ' - ' + (item.title || item.identification || ('#' + item.id));

        var contentHtml = '<div class="detailed-doi-errors-modal">';

        // 1. Registration Agency Deposit Details Section
        contentHtml += '<h3>' + escapeHtml(labels.sectionDepositDetails || 'Registration Agency Deposit Details') + '</h3>';

        if (!diagnostics.doiDetails || diagnostics.doiDetails.length === 0) {
            contentHtml += '<p class="text-muted">' + escapeHtml(labels.noDepositErrors || 'No deposit error details recorded on this DOI.') + '</p>';
        } else {
            diagnostics.doiDetails.forEach(function (doi) {
                contentHtml += '<div class="diag-card">';
                contentHtml += '<div class="diag-grid">';
                contentHtml += '<div class="diag-label">' + escapeHtml(labels.doi || 'DOI') + ':</div><div><strong>' + escapeHtml(doi.doi || '(None)') + '</strong> <span class="diag-badge diag-badge-error">' + escapeHtml(doi.statusString) + '</span></div>';
                contentHtml += '<div class="diag-label">' + escapeHtml(labels.agency || 'Agency') + ':</div><div>' + escapeHtml(doi.registrationAgency) + '</div>';

                if (doi.batchId) {
                    contentHtml += '<div class="diag-label">' + escapeHtml(labels.batchId || 'Batch / Deposit ID') + ':</div><div><code>' + escapeHtml(doi.batchId) + '</code></div>';
                }
                contentHtml += '</div>';

                // Parsed Errors if any
                if (doi.parsedErrors && doi.parsedErrors.length > 0) {
                    contentHtml += '<div style="margin-top: 0.5rem;"><strong>' + escapeHtml(labels.parsedErrors || 'Parsed Error Diagnostic') + ':</strong></div>';
                    doi.parsedErrors.forEach(function (pe) {
                        contentHtml += '<div style="background: #fff; border-left: 3px solid #dc2626; padding: 0.5rem; margin-top: 0.25rem;">';
                        contentHtml += '<strong>' + escapeHtml(pe.type) + ':</strong> ' + escapeHtml(pe.message);
                        contentHtml += '</div>';
                    });
                }

                // Raw response if any
                if (doi.rawFailedMessage) {
                    contentHtml += '<div style="margin-top: 0.5rem;"><strong>' + escapeHtml(labels.rawResponse || 'Raw Response / XML Body') + ':</strong></div>';
                    contentHtml += '<pre class="diag-pre">' + escapeHtml(doi.rawFailedMessage) + '</pre>';
                } else if (!doi.parsedErrors || doi.parsedErrors.length === 0) {
                    contentHtml += '<p class="text-muted" style="margin-top: 0.5rem;">' + escapeHtml(labels.noDepositErrors || 'No specific error text found.') + '</p>';
                }

                contentHtml += '</div>';
            });
        }

        // 2. Queue / Job Failure Details Section
        contentHtml += '<h3>' + escapeHtml(labels.sectionJobDetails || 'Queue / Background Job Failure Details') + '</h3>';

        if (!diagnostics.failedJobs || diagnostics.failedJobs.length === 0) {
            contentHtml += '<p class="text-muted">' + escapeHtml(labels.noFailedJobs || 'No failed background queue jobs found for this item.') + '</p>';
        } else {
            diagnostics.failedJobs.forEach(function (job) {
                contentHtml += '<div class="diag-card">';
                contentHtml += '<div class="diag-grid">';
                contentHtml += '<div class="diag-label">' + escapeHtml(labels.jobId || 'Job ID') + ':</div><div>#' + escapeHtml(job.id) + ' <span class="diag-badge diag-badge-job">' + escapeHtml(job.jobName || 'Deposit Job') + '</span></div>';
                contentHtml += '<div class="diag-label">' + escapeHtml(labels.queue || 'Queue') + ':</div><div>' + escapeHtml(job.queue) + ' (' + escapeHtml(job.connection) + ')</div>';
                contentHtml += '<div class="diag-label">' + escapeHtml(labels.failedAt || 'Failed At') + ':</div><div>' + escapeHtml(job.failedAt) + '</div>';
                contentHtml += '</div>';

                if (job.exceptionMessage) {
                    contentHtml += '<div><strong>' + escapeHtml(labels.exception || 'Exception Message') + ':</strong></div>';
                    contentHtml += '<div style="background: #fff; border-left: 3px solid #f59e0b; padding: 0.5rem; margin-top: 0.25rem; font-family: monospace; font-size: 0.85rem;">' + escapeHtml(job.exceptionMessage) + '</div>';
                }

                if (job.exceptionTrace) {
                    contentHtml += '<div style="margin-top: 0.5rem;"><strong>' + escapeHtml(labels.stackTrace || 'Stack Trace') + ':</strong></div>';
                    contentHtml += '<pre class="diag-pre">' + escapeHtml(job.exceptionTrace) + '</pre>';
                }

                contentHtml += '</div>';
            });
        }

        // Diagnostic action toolbar
        contentHtml += '<div class="diag-actions">';
        contentHtml += '<button type="button" class="pkpButton" id="btn-copy-diagnostics">' + escapeHtml(labels.copyAll || 'Copy Diagnostics') + '</button>';
        contentHtml += '</div>';

        contentHtml += '</div>';

        // Check if pkp.controllers.Page dialog or legacy dialog is available
        var useModalModule = pkp.modules && pkp.modules.useModal;
        if (useModalModule && typeof useModalModule.useModal === 'function') {
            try {
                var modal = useModalModule.useModal();
                modal.openDialog({
                    name: 'detailedDoiErrorsModal',
                    title: title,
                    message: contentHtml,
                    actions: [
                        {
                            label: labels.close || labels.ok || 'Close',
                            isPrimary: true,
                            callback: function (close) {
                                close();
                            }
                        }
                    ],
                    modalStyle: 'negative'
                });
                bindCopyButton(diagnostics);
                return;
            } catch (e) {
                // fallback to jQuery dialog
            }
        }

        // Fallback: Custom jQuery / OJS modal dialog
        var $dialog = $('<div></div>').html(contentHtml).dialog({
            title: title,
            width: 750,
            modal: true,
            closeOnEscape: true,
            buttons: [
                {
                    text: labels.close || 'Close',
                    class: 'pkpButton',
                    click: function () {
                        $(this).dialog('close');
                    }
                }
            ],
            close: function () {
                $(this).dialog('destroy').remove();
            }
        });

        bindCopyButton(diagnostics);
    }

    function bindCopyButton(diagnostics) {
        setTimeout(function () {
            $('#btn-copy-diagnostics').off('click').on('click', function () {
                var jsonStr = JSON.stringify(diagnostics, null, 2);
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(jsonStr).then(function () {
                        alert('Diagnostic details copied to clipboard!');
                    });
                } else {
                    var $temp = $('<textarea>');
                    $('body').append($temp);
                    $temp.val(jsonStr).select();
                    document.execCommand('copy');
                    $temp.remove();
                    alert('Diagnostic details copied to clipboard!');
                }
            });
        }, 100);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Fetch diagnostics from API and open modal
     */
    function fetchAndOpenDiagnostics(item, itemType, config) {
        var labels = (config && config.labels) || {};
        var apiUrl = (config && config.apiUrl) || '';
        if (!apiUrl) {
            alert('Diagnostics API URL is not configured.');
            return;
        }

        var endpoint = apiUrl + '/' + encodeURIComponent(itemType) + '/' + encodeURIComponent(item.id);

        $.ajax({
            url: endpoint,
            method: 'GET',
            headers: {
                'X-Csrf-Token': pkp.currentUser ? pkp.currentUser.csrfToken : ''
            },
            beforeSend: function () {
                // Show loading notification if available
            },
            success: function (data) {
                showDiagnosticsModal(item, data, config);
            },
            error: function (xhr, status, error) {
                var errorMsg = labels.fetchError || 'Unable to retrieve diagnostic details for this item.';
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMsg += ' (' + xhr.responseJSON.error + ')';
                }
                alert(errorMsg);
            }
        });
    }

    /**
     * Hook into DoiListItem components when Vue mounts or updates
     */
    function attachDiagnosticsButtons() {
        var listPanels = [
            pkp.registry && pkp.registry.getComponent && pkp.registry.getComponent('submissionDoiListPanel'),
            pkp.registry && pkp.registry.getComponent && pkp.registry.getComponent('issueDoiListPanel')
        ];

        // Process all DoiListItems in DOM
        $('.doiListItem').each(function () {
            var $itemEl = $(this);
            if ($itemEl.data('detailedDoiErrorsBound')) {
                return;
            }

            // Find the actions area (e.g., where 'View Error' or 'Deposit' buttons reside)
            var $actionsArea = $itemEl.find('.doiListItem__actions, .doiListItem__itemActions, .pkpListPanelItem__actions, div[class*="actions"]').first();
            if ($actionsArea.length === 0) {
                $actionsArea = $itemEl;
            }

            // Check if there is an existing error badge or errorMessageModalButton
            var hasError = $itemEl.find('[ref="errorMessageModalButton"], .badge--error, span:contains("Error"), .pkpBadge--error').length > 0;
            var isDoiStatusError = $itemEl.text().indexOf('Error') !== -1;

            if (hasError || isDoiStatusError) {
                // Retrieve item data from closest Vue component instance
                var vueInstance = null;
                var el = this;
                while (el && !vueInstance) {
                    if (el.__vueParentComponent || el.__vue_app__) {
                        vueInstance = el.__vueParentComponent || el.__vue_app__;
                    }
                    el = el.parentElement;
                }

                // Append diagnostic button if not already added
                if ($itemEl.find('.detailed-doi-errors-btn').length === 0) {
                    var $btn = $('<button type="button" class="pkpButton detailed-doi-errors-btn"><span class="fa fa-stethoscope" aria-hidden="true"></span> Detailed Error & Job Logs</button>');
                    
                    $btn.on('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();

                        // Resolve item data and config
                        var item = null;
                        var itemType = 'submission';
                        var config = null;

                        // Try locating item from state
                        if (pkp.registry && pkp.registry._instances) {
                            for (var key in pkp.registry._instances) {
                                var inst = pkp.registry._instances[key];
                                if (inst && inst.components) {
                                    var panel = inst.components.submissionDoiListPanel || inst.components.issueDoiListPanel;
                                    if (panel && panel.detailedDoiErrors) {
                                        config = panel.detailedDoiErrors;
                                    }
                                }
                            }
                        }

                        // Check root state
                        if (!config && window.pkp && window.pkp.context) {
                            config = window.pkp.detailedDoiErrors;
                        }

                        // Determine item type and ID from data attributes or DOM
                        var itemId = $itemEl.attr('data-id') || $itemEl.attr('id');
                        if (!itemId) {
                            // Extract numbers from id string
                            var matches = ($itemEl.attr('class') || '').match(/id-(\d+)/);
                            if (matches) itemId = matches[1];
                        }

                        // Fallback search through Vue items
                        if (window.pkp && window.pkp.registry && window.pkp.registry._instances) {
                            Object.keys(window.pkp.registry._instances).forEach(function(instKey) {
                                var inst = window.pkp.registry._instances[instKey];
                                if (inst && inst.$data && inst.$data.items) {
                                    // search item
                                }
                            });
                        }

                        // If item can be determined
                        var resolvedItem = {
                            id: itemId ? parseInt(itemId.replace(/\D/g, ''), 10) : 1,
                            title: $itemEl.find('.doiListItem__title, .pkpListPanelItem__title').text().trim()
                        };

                        if (!resolvedItem.id || isNaN(resolvedItem.id)) {
                            // Search closest row or checkbox value
                            var val = $itemEl.find('input[type="checkbox"]').val();
                            if (val) {
                                resolvedItem.id = parseInt(val, 10);
                            }
                        }

                        if ($itemEl.closest('#issue-doi-management').length > 0) {
                            itemType = 'issue';
                        }

                        fetchAndOpenDiagnostics(resolvedItem, itemType, config || {
                            apiUrl: $('body').attr('data-api-url') ? $('body').attr('data-api-url') + '/dois/diagnostics' : '/index.php/api/v1/dois/diagnostics',
                            labels: {}
                        });
                    });

                    $actionsArea.append($btn);
                    $itemEl.data('detailedDoiErrorsBound', true);
                }
            }
        });
    }

    // Set up MutationObserver and root:mounted event listeners
    $(document).ready(function () {
        if (window.pkp && window.pkp.eventBus) {
            window.pkp.eventBus.$on('root:mounted', function () {
                setTimeout(attachDiagnosticsButtons, 200);
            });
        }

        // Attach interval & observer to handle pagination and tab switches
        setInterval(attachDiagnosticsButtons, 1000);

        var observer = new MutationObserver(function () {
            attachDiagnosticsButtons();
        });

        var targetNode = document.querySelector('.doiListPanel, #submission-doi-management, #issue-doi-management, body');
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
        }
    });

})(jQuery);
