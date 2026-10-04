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

        // 1. Try pkp.eventBus.$emit('open-dialog-vue')
        if (window.pkp && window.pkp.eventBus && typeof window.pkp.eventBus.$emit === 'function') {
            try {
                window.pkp.eventBus.$emit('open-dialog-vue', {
                    dialogProps: {
                        name: 'detailedDoiErrorsModal',
                        title: title,
                        message: contentHtml,
                        actions: [
                            {
                                label: labels.close || labels.ok || 'Close',
                                isPrimary: true,
                                callback: function (close) {
                                    if (typeof close === 'function') {
                                        close();
                                    } else {
                                        window.pkp.eventBus.$emit('close-dialog-vue');
                                    }
                                }
                            }
                        ],
                        modalStyle: 'negative'
                    }
                });
                bindCopyButton(diagnostics);
                return;
            } catch (e) {
                // proceed to fallbacks
            }
        }

        // 2. Try pkp.modules.useModal
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
                // proceed to fallback
            }
        }

        // 3. Fallback: Standalone modal overlay
        renderOverlayModal(title, contentHtml, labels, diagnostics);
    }

    function renderOverlayModal(title, contentHtml, labels, diagnostics) {
        $('#detailed-doi-modal-overlay').remove();

        var overlayHtml = '<div id="detailed-doi-modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;padding:1rem;">'
            + '<div style="background:#fff;border-radius:8px;max-width:850px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);overflow:hidden;">'
            + '<div style="padding:1rem 1.5rem;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">'
            + '<h2 style="margin:0;font-size:1.15rem;color:#0f172a;font-weight:600;">' + escapeHtml(title) + '</h2>'
            + '<button type="button" id="detailed-doi-modal-close-x" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#64748b;line-height:1;">&times;</button>'
            + '</div>'
            + '<div style="padding:1.5rem;overflow-y:auto;flex:1;">'
            + contentHtml
            + '</div>'
            + '<div style="padding:0.75rem 1.5rem;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:flex-end;">'
            + '<button type="button" class="pkpButton" id="detailed-doi-modal-close-btn">' + escapeHtml(labels.close || 'Close') + '</button>'
            + '</div>'
            + '</div>'
            + '</div>';

        $('body').append(overlayHtml);

        $('#detailed-doi-modal-close-x, #detailed-doi-modal-close-btn').on('click', function () {
            $('#detailed-doi-modal-overlay').remove();
        });

        $('#detailed-doi-modal-overlay').on('click', function (e) {
            if (e.target === this) {
                $(this).remove();
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
     * Resolve API URL and Labels from available PKP configurations
     */
    function getPluginConfig() {
        var config = null;

        if (window.pkp && window.pkp.registry && window.pkp.registry._instances) {
            for (var key in window.pkp.registry._instances) {
                var inst = window.pkp.registry._instances[key];
                if (inst && inst.components) {
                    var panel = inst.components.submissionDoiListPanel || inst.components.issueDoiListPanel;
                    if (panel && panel.detailedDoiErrors) {
                        config = panel.detailedDoiErrors;
                        break;
                    }
                }
            }
        }

        if (!config && window.pkp && window.pkp.context && window.pkp.context.apiBaseUrl) {
            config = {
                apiUrl: window.pkp.context.apiBaseUrl + '/dois/diagnostics',
                labels: {}
            };
        }

        if (!config) {
            // Default fallback
            var currentPath = window.location.pathname;
            var parts = currentPath.split('/');
            var journalIndex = parts.indexOf('index.php');
            var journal = (journalIndex !== -1 && parts[journalIndex + 1]) ? parts[journalIndex + 1] : '';

            config = {
                apiUrl: journal ? '/index.php/' + journal + '/api/v1/dois/diagnostics' : '/index.php/api/v1/dois/diagnostics',
                labels: {}
            };
        }

        return config;
    }

    /**
     * Fetch diagnostics from API and open modal
     */
    function fetchAndOpenDiagnostics(item, itemType, config) {
        config = config || getPluginConfig();
        var labels = (config && config.labels) || {};
        var apiUrl = (config && config.apiUrl) || '';

        if (!apiUrl) {
            alert('Diagnostics API URL could not be resolved.');
            return;
        }

        var endpoint = apiUrl.replace(/\/+$/, '') + '/' + encodeURIComponent(itemType) + '/' + encodeURIComponent(item.id);

        $.ajax({
            url: endpoint,
            method: 'GET',
            headers: {
                'X-Csrf-Token': pkp.currentUser ? pkp.currentUser.csrfToken : ''
            },
            beforeSend: function () {
                // Show brief visual feedback if button clicked
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
        var config = getPluginConfig();
        var btnText = (config.labels && config.labels.buttonLabel) || 'Detailed Error & Job Logs';

        // Select all DOI list items in OJS 3.5:
        // In OJS 3.5 DoiListPanel template, items have class .listPanel__item--doi and id="list-item-{type}-{id}"
        var $items = $('.listPanel__item--doi, [id^="list-item-submission-"], [id^="list-item-issue-"], .doiListItem');

        $items.each(function () {
            var $itemEl = $(this);
            var idAttr = $itemEl.attr('id') || '';

            // Extract itemType and itemId
            var itemType = 'submission';
            var itemId = null;

            var idMatch = idAttr.match(/list-item-(submission|issue)-(\d+)/);
            if (idMatch) {
                itemType = idMatch[1];
                itemId = parseInt(idMatch[2], 10);
            } else {
                // Fallback from checkboxes: name="submission[]" value="123"
                var $chk = $itemEl.find('input[type="checkbox"]');
                var chkName = $chk.attr('name') || '';
                if (chkName.indexOf('issue') !== -1 || $itemEl.closest('#issue-doi-management').length > 0) {
                    itemType = 'issue';
                }
                if ($chk.val()) {
                    itemId = parseInt($chk.val(), 10);
                }
            }

            if (!itemId) {
                return;
            }

            var itemTitle = $itemEl.find('.listPanel__itemTitle, .doiListItem__title, a[href*="article"], a[href*="issue"]').first().text().trim() || ('#' + itemId);
            var resolvedItem = {
                id: itemId,
                title: itemTitle
            };

            // Detect error status:
            // 1) Badge with text "Error" or class badge--error / badge--warn
            // 2) Element [ref="errorMessageModalButton"]
            // 3) Text content includes "Error" in badge area
            var $badge = $itemEl.find('.doiListItem__itemMetadata--badge, .badge, [class*="Badge"]');
            var hasErrorBadge = false;
            $badge.each(function () {
                var text = $(this).text().trim().toLowerCase();
                if (text === 'error' || text.indexOf('error') !== -1) {
                    hasErrorBadge = true;
                }
            });

            var hasErrorMessageBtn = $itemEl.find('[ref="errorMessageModalButton"]').length > 0;
            var isError = hasErrorBadge || hasErrorMessageBtn;

            // Also check if user wants to see diagnostics on ANY item (or specifically error items)
            if (isError) {
                // 1. Add diagnostic button to top-level actions area (.listPanel__itemActions)
                var $topActions = $itemEl.find('.listPanel__itemActions').first();
                if ($topActions.length > 0 && $topActions.find('.detailed-doi-errors-btn').length === 0) {
                    var $topBtn = $('<button type="button" class="pkpButton detailed-doi-errors-btn" title="View detailed DOI deposit and queue errors">' + escapeHtml(btnText) + '</button>');
                    $topBtn.on('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        fetchAndOpenDiagnostics(resolvedItem, itemType, config);
                    });
                    // Insert before the expander button if present, or append
                    var $expander = $topActions.find('.expander, button[class*="expander"]');
                    if ($expander.length > 0) {
                        $topBtn.insertBefore($expander);
                    } else {
                        $topActions.append($topBtn);
                    }
                }

                // 2. Add diagnostic button to expanded depositor actions area (.doiListItem__depositorActions)
                var $expandedActions = $itemEl.find('.doiListItem__depositorActions').first();
                if ($expandedActions.length > 0 && $expandedActions.find('.detailed-doi-errors-btn-expanded').length === 0) {
                    var $expBtn = $('<button type="button" class="pkpButton detailed-doi-errors-btn detailed-doi-errors-btn-expanded" style="margin-left:0.5rem;"><span class="fa fa-stethoscope" aria-hidden="true"></span> ' + escapeHtml(btnText) + '</button>');
                    $expBtn.on('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        fetchAndOpenDiagnostics(resolvedItem, itemType, config);
                    });
                    $expandedActions.append($expBtn);
                }
            }
        });
    }

    // Initialize and keep observing DOM
    $(document).ready(function () {
        if (window.pkp && window.pkp.eventBus) {
            window.pkp.eventBus.$on('root:mounted', function () {
                setTimeout(attachDiagnosticsButtons, 200);
            });
        }

        // Periodic sweep for tab switches, pagination, and Vue updates
        attachDiagnosticsButtons();
        setInterval(attachDiagnosticsButtons, 800);

        var observer = new MutationObserver(function () {
            attachDiagnosticsButtons();
        });

        var targetNode = document.querySelector('#app') || document.body;
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
        }
    });

})(jQuery);
