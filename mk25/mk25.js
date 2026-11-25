async function startMk25() {
  const response = await fetch('mk25/benchmark-data.json?v=18');
  if (!response.ok) throw new Error('Benchmarkdaten fehlen');
  const payload = await response.json();
    const defaultComparisonColumnCount = () => window.matchMedia('(max-width: 700px)').matches ? 2 : 5;
    const compareState = {
      columnCount: defaultComparisonColumnCount(),
      activeColumnCount: defaultComparisonColumnCount(),
      automaticColumns: false,
      manualColumns: false,
      incompleteOnly: false,
      columns: (payload.release_matrix?.default_keys || []).slice(0, defaultComparisonColumnCount()),
      sort: 'release'
    };
    const preselectionState = {
      backend: new Set(),
      model: new Set(),
      type: new Set(),
      capability: new Set(),
      parameter: new Set(),
      ram: new Set(),
      data: new Set()
    };
    const DASHBOARD_PREFERENCES_KEY = 'mcfly.local-llm-benchmark.dashboard.preferences.v1';
    const DASHBOARD_DETAILS_KEY = 'mcfly.local-llm-benchmark.dashboard.details.v1';
    let restoredComparisonPreferences = false;
    function persistComparisonPreferences() {
      try {
        localStorage.setItem(DASHBOARD_PREFERENCES_KEY, JSON.stringify({
          comparison: {
            columnCount: compareState.columnCount,
            automaticColumns: compareState.automaticColumns,
            manualColumns: compareState.manualColumns,
            incompleteOnly: compareState.incompleteOnly,
            columns: compareState.columns,
            sort: compareState.sort,
            preselection: Object.fromEntries(Object.entries(preselectionState).map(([key, values]) => [key, [...values]]))
          }
        }));
      } catch (_error) {
        // Storage may be disabled by the browser; the dashboard remains fully usable.
      }
    }
    function restoreComparisonPreferences() {
      try {
        const saved = JSON.parse(localStorage.getItem(DASHBOARD_PREFERENCES_KEY) || 'null')?.comparison;
        if (!saved || typeof saved !== 'object') return;
        const columns = Array.isArray(saved.columns) ? saved.columns.filter(value => typeof value === 'string') : [];
        const columnCount = Number(saved.columnCount);
        if (Number.isInteger(columnCount) && columnCount >= 2 && columnCount <= 20) compareState.columnCount = columnCount;
        // ``dynamicColumns`` was the short-lived checkbox setting.  Retain
        // it only as a one-time migration to the clearer dropdown label.
        if (typeof saved.automaticColumns === 'boolean') compareState.automaticColumns = saved.automaticColumns;
        else if (typeof saved.dynamicColumns === 'boolean') compareState.automaticColumns = saved.dynamicColumns;
        if (saved.sort === 'incomplete') {
          compareState.sort = 'value';
          compareState.incompleteOnly = true;
        } else if (['ram', 'quality', 'release', 'value'].includes(saved.sort)) {
          compareState.sort = saved.sort;
        }
        if (typeof saved.incompleteOnly === 'boolean') compareState.incompleteOnly = saved.incompleteOnly;
        compareState.manualColumns = saved.manualColumns === true;
        compareState.columns = compareState.manualColumns ? columns.slice(0, compareState.columnCount) : [];
        const filters = saved.preselection || {};
        Object.entries(preselectionState).forEach(([key, values]) => {
          const savedValues = filters[key];
          if (Array.isArray(savedValues)) savedValues.filter(value => typeof value === 'string').forEach(value => values.add(key === 'model' && /^(?:Nemotron|Nemotron 3)$/.test(value) ? 'Nemotron 3 Nano' : key === 'model' && /^(?:Ministral|Mistral|Mixtral)$/.test(value) ? 'Devstral' : value));
        });
        restoredComparisonPreferences = true;
        if (saved.sort === 'alphabetical') persistComparisonPreferences();
      } catch (_error) {
        // Ignore malformed or stale local preferences.
      }
    }
    function restoreDashboardDetails() {
      let saved = {};
      try {
        const parsed = JSON.parse(localStorage.getItem(DASHBOARD_DETAILS_KEY) || '{}');
        if (parsed && typeof parsed === 'object') saved = parsed;
      } catch (_error) {
        // Ignore malformed or unavailable local storage.
      }
      const details = [...document.querySelectorAll('details[data-dashboard-details-key]')];
      details.forEach(detail => {
        const key = detail.dataset.dashboardDetailsKey;
        if (typeof saved[key] === 'boolean') detail.open = saved[key];
      });
      details.forEach(detail => detail.addEventListener('toggle', () => {
        try {
          const next = Object.fromEntries(details.map(item => [item.dataset.dashboardDetailsKey, item.open]));
          localStorage.setItem(DASHBOARD_DETAILS_KEY, JSON.stringify(next));
        } catch (_error) {
          // Storage may be disabled; the dashboard remains usable.
        }
      }));
    }
    const fmtMs = (ms) => {
      if (ms === null || ms === undefined || ms === '') return '';
      if (ms >= 60000) return (ms / 60000).toFixed(1) + ' min';
      if (ms >= 1000) return (ms / 1000).toFixed(1) + ' s';
      return ms + ' ms';
    };
    const fmtInt = (value) => Number(value || 0).toLocaleString('de-DE');
    const fmtDateTime = (value) => {
      if (!value) return 'nicht erfasst';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('de-DE');
    };
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const valuePassRate = (value) => {
      if (!value || !value.total) return -1;
      return value.passed / value.total;
    };
    const speedEligible = (value) => {
      if (!value || !value.total || !value.duration_ms || value.not_applicable) return false;
      if (value.complete === false) return false;
      const status = String(value.status || '').toLowerCase();
      if (['fail', 'timeout', 'error'].includes(status)) return false;
      return valuePassRate(value) >= 0.5;
    };
    const compactValue = (value) => {
      if (!value) return '<span class="muted">offen</span>';
      return `<strong>${(value.pass_rate * 100).toFixed(1)}%</strong><br><span class="muted">${value.passed}/${value.total} · ${fmtMs(value.duration_ms)}</span>`;
    };
    const summaryPct = (value) => value === null || value === undefined
      ? '<span class="muted">offen</span>'
      : `<strong>${value.toFixed(1)}%</strong>`;
    const qualityDelta = (row) => row.quality_delta_pp === null || row.quality_delta_pp === undefined
      ? 'offen'
      : `${esc(row.quality_winner)} +${row.quality_delta_pp.toFixed(1)} pp`;
    const speedDelta = (row) => row.speed_factor === null || row.speed_factor === undefined
      ? 'offen'
      : `${esc(row.speed_winner)} ${row.speed_factor.toFixed(1)}x schneller<br><span class="muted">${fmtMs(row.speed_saved_ms)} Unterschied</span>`;
    const rateClass = (value) => {
      if (!value || !value.total) return 'matrix-rate-bad';
      if (value.passed === value.total) return 'matrix-rate-good';
      if (value.passed > 0) return 'matrix-rate-warn';
      return 'matrix-rate-bad';
    };
    const isOpenMatrixValue = (value) => !value || value.pending === true;
    const matrixValueHtml = (value, quality, speed) => {
      if (value?.stale === true) {
        const detail = value.cause?.detail || value.note || 'Ergebnis erfüllt den aktuellen Releasevertrag nicht.';
        return `<td class="matrix-cell"><span class="matrix-rate matrix-rate-warn">veraltet</span><div class="matrix-note">${esc(detail)}</div><div class="matrix-badges">&nbsp;</div></td>`;
      }
      if (isOpenMatrixValue(value)) {
        const detail = value.cause?.detail || value.note || 'Gueltiger Lauf fehlt.';
        return `<td class="matrix-cell"><span class="matrix-rate matrix-rate-open">offen</span><div class="matrix-note">${esc(detail)}</div><div class="matrix-badges">&nbsp;</div></td>`;
      }
      if (value.not_applicable === true) {
        const cause = value.cause?.detail ? `<div class="matrix-note">${esc(value.cause.detail)}</div>` : '';
        return `<td class="matrix-cell"><span class="matrix-rate matrix-rate-warn">N/A</span>${cause}<div class="matrix-badges">${quality}${speed || '&nbsp;'}</div></td>`;
      }
      const score = value.score ?? (value.passed * 2 + (value.partial || 0));
      const maxScore = value.max_score ?? (value.total * 2);
      const rateValue = value.display_rate ?? (maxScore ? score / maxScore : value.pass_rate);
      const rate = value.total ? (rateValue * 100).toFixed(1) + '%' : '';
      const primaryCount = `${fmtInt(value.passed)}/${fmtInt(value.total)}`;
      const badges = `${quality}${speed}`;
      return `<td class="matrix-cell"><span class="matrix-rate ${rateClass(value)}">${esc(rate)}</span><div class="matrix-goals"><strong>${primaryCount}</strong> Aufgaben</div><span class="matrix-duration">${fmtMs(value.duration_ms)}</span><div class="matrix-badges">${badges || '&nbsp;'}</div></td>`;
    };

    function compareOptionsByKey() {
      return Object.fromEntries((payload.release_matrix?.options || []).map(option => [option.key, option]));
    }

    function hasActivePreselection() {
      // A normal view shows every matching profile. Completeness is only a
      // deliberate control view, never an implicit historical-data filter.
      return true;
    }

    function rowMatchesPreselection(row) {
      if (!hasActivePreselection()) return true;
      const optionKey = row.option_key || row.model_key;
      const option = compareOptionsByKey()[optionKey] || {
        key: optionKey || '',
        label: row.model || optionKey || 'unbekannt',
        model: row.model || optionKey || 'unbekannt',
        backend: row.backend || 'unbekannt',
        data_stand: row.data_stand || null,
        apple_ram_levels: [],
      };
      return optionMatchesPreselection(option, row.data_stand || null);
    }

    function optionParameterBillions(option) {
      const source = String(option.parameter_scale || option.label || '');
      const match = source.match(/(\d+(?:\.\d+)?)B/);
      return match ? Number(match[1]) : -1;
    }

    function optionRamRequirement(option) {
      // RAM filtering is evidence based.  A static planning heuristic must
      // never upgrade an unmeasured profile to a usable hardware class.
      const eligible = (option.capacity_evidence || [])
        .filter(item => ['confirmed_fit', 'projected_fit'].includes(String(item.admission_status || '')))
        .map(item => Number(item.target_memory_gb))
        .filter(Number.isFinite);
      return eligible.length ? Math.min(...eligible) : null;
    }

    function optionFitsRamSelection(option, ramGb) {
      const selectedGb = Number(ramGb);
      if (!Number.isFinite(selectedGb)) return false;
      // The preselection selects benchmark *series*, not a machine that has
      // at least this much memory. A 16-GB selection therefore must not pull
      // in 8-GB candidates merely because they also fit that machine.
      return Number(option.target_ram_gb) === selectedGb;
    }

    function optionModelLabel(option) {
      return String(option.model || option.label || option.key);
    }

    function optionModelFamily(option) {
      const text = optionModelLabel(option);
      // The preselection is deliberately a family switch, not a version or
      // an individual-model picker.  Keep model versions in the table and
      // column selectors, but never expose them as filter choices here.
      // Retain the persisted legacy family key; match every Nemotron generation.
      if (/nemotron/i.test([option.key, option.label, option.model].filter(Boolean).join(' '))) return 'Nemotron 3 Nano';
      if (/qwen/i.test(text)) return 'Qwen';
      if (/gemma/i.test(text)) return 'Gemma';
      if (/deepseek/i.test(text)) return 'DeepSeek';
      // Explicit vendor/family names, never fuzzy *stral matching.
      if (/^mistral(?: ai)?$/i.test(String(option.manufacturer || '').trim())
          || /^(?:devstral|ministral|mistral|mixtral)(?:|[ -])/i.test(text)) return 'Devstral';
      if (/gpt/i.test(text)) return 'GPT';
      if (/glm/i.test(text)) return 'GLM';
      if (/llama/i.test(text)) return 'Llama';
      return text.replace(/\s+(?:\d+(?:\.\d+)?B(?:-A\d+(?:\.\d+)?B)?|Dense|MoE|Omni|Thinking|MTP|Instruct)\b.*/i, '').trim() || text;
    }

    function optionTypes(option) {
      // Cloud variants share a display model name; their thinking state lives
      // in the stable option key and human-readable label.  Use all three
      // identifiers so the preselection remains correct for every backend.
      const text = [option.key, option.label, option.model].filter(Boolean).join(' ').toLowerCase();
      const types = [];
      if (/\bmoe\b|\b\d+(?:\.\d+)?b-a\d+(?:\.\d+)?b\b/i.test(text)) types.push('MoE');
      if (/\bdense\b/i.test(text)) types.push('Dense');
      if (/\bomni\b/i.test(text)) types.push('Omni');
      if (/\bthinking\b/i.test(text)) types.push('Thinking');
      else types.push('No-Thinking');
      if (/\bmtp\b/i.test(text)) types.push('MTP');
      return types.length ? types : ['unbekannt'];
    }

    function optionCapabilityValues(option) {
      const rows = Object.values(payload.release_matrix?.rows || {});
      const valid = (category) => {
        const value = rows.find(row => row.category === category)?.values?.[option.key];
        return Boolean(value && value.total && !value.not_applicable && value.complete !== false);
      };
      const capabilities = ['Text'];
      if (valid('vision')) capabilities.push('Vision');
      if (valid('audio')) capabilities.push('Audio');
      if (valid('speech')) capabilities.push('Speech');
      // "Omni" is a practical label, not a manufacturer claim: all three
      // modalities must have a valid run and at least half their tasks pass.
      const practical = (category) => {
        const value = rows.find(row => row.category === category)?.values?.[option.key];
        return valid(category) && valuePassRate(value) >= 0.5;
      };
      if (practical('vision') && practical('audio') && practical('speech')) capabilities.push('Omni');
      return capabilities;
    }

    function optionParameterProfile(option) {
      return option.sampling_profile === 'Unsloth' ? 'Unsloth' : 'McFly';
    }

    function comparableValue(value) {
      return Boolean(value && value.total && !value.not_applicable && value.complete !== false
        && !value.pending && !value.stale);
    }

    const comparisonCategories = [
      'portal_safety', 'live_duckduckgo', 'agent_tasks', 'tool_calling', 'coding',
      'vision', 'audio', 'speech', 'reasoning', 'reasoning_tools'
    ];

    function comparisonProfileIsThinking(option) {
      const text = [option?.key, option?.label, option?.model].filter(Boolean).join(' ').toLowerCase();
      return !/(no[-_ ]thinking)/.test(text) && text.includes('thinking');
    }

    function comparisonExpectedTasks(row) {
      const values = Object.values(row?.values || {}).filter(Boolean);
      const expected = values.map(value => Number(value.expected_total) || 0).filter(total => total > 0);
      if (expected.length) return Math.max(...expected);
      const observed = values.map(value => Number(value.total) || 0).filter(total => total > 0);
      return observed.length ? Math.max(...observed) : 0;
    }

    function comparisonRowsForOption(option) {
      const rows = payload.release_matrix?.rows || [];
      const reasoningPrefix = comparisonProfileIsThinking(option) ? 'thinking_' : 'no_thinking_';
      return comparisonCategories.map(category => {
        const matches = rows.filter(row => row.category === category);
        if (['reasoning', 'reasoning_tools'].includes(category)) {
          return matches.find(row => String(row.reasoning_variant || '').startsWith(reasoningPrefix)) || null;
        }
        return matches.find(row => !row.score_group) || matches[0] || null;
      }).filter(Boolean);
    }

    function comparisonStatsForOptions(options) {
      return new Map(options.map(option => {
        const rows = comparisonRowsForOption(option);
        const expectedTasks = rows.reduce((sum, row) => sum + comparisonExpectedTasks(row), 0);
        const values = rows.map(row => row.values?.[option.key]).filter(comparableValue);
        const passed = values.reduce((sum, value) => sum + Number(value.passed || 0), 0);
        const timed = values.filter(value => Number(value.duration_ms) > 0);
        const timedTasks = timed.reduce((sum, value) => sum + Number(value.total || 0), 0);
        const duration = timed.reduce((sum, value) => sum + Number(value.duration_ms || 0), 0);
        // Quality deliberately uses the complete fixed benchmark basis.  A
        // missing capability therefore cannot improve the score.  Runtime is
        // normalized only by tasks that actually ran, so additional media
        // capabilities are credited for quality without being charged as a
        // larger suite merely because more tests were applicable.
        const quality = expectedTasks ? passed / expectedTasks : null;
        const durationPerTask = timedTasks && duration ? duration / timedTasks : null;
        const value = quality === null || !durationPerTask ? null : Math.pow(quality, 2) / durationPerTask;
        return [option.key, { quality, durationPerTask, value, categories: rows.length }];
      }));
    }

    function comparisonWinners(options, selectedKeys) {
      const stats = comparisonStatsForOptions(options);
      const values = selectedKeys.map(key => [key, stats.get(key)]).filter(([, value]) => value);
      if (!values.length) return { quality: new Set(), speed: new Set(), value: new Set() };
      const bestQuality = Math.max(...values.map(([, value]) => value.quality ?? -1));
      const bestTime = Math.min(...values.map(([, value]) => value.durationPerTask ?? Number.MAX_SAFE_INTEGER));
      const bestValue = values.length >= 2 ? Math.max(...values.map(([, value]) => value.value ?? -1)) : null;
      return {
        quality: new Set(values.filter(([, value]) => value.quality === bestQuality).map(([key]) => key)),
        speed: new Set(values.filter(([, value]) => value.durationPerTask === bestTime).map(([key]) => key)),
        value: new Set(bestValue === null ? [] : values.filter(([, value]) => value.value === bestValue).map(([key]) => key))
      };
    }

    function optionIncompleteCount(option) {
      return Object.values(payload.release_matrix?.rows || {})
        .map(row => row.values?.[option.key])
        .filter(isOpenMatrixValue)
        .length;
    }

    function sortComparisonOptions(options) {
      const stats = comparisonStatsForOptions(options);
      return options.slice().sort((left, right) => {
        if (compareState.sort === 'ram') {
          const ramOrder = (optionRamRequirement(right) ?? -1) - (optionRamRequirement(left) ?? -1);
          if (ramOrder) return ramOrder;
        }
        if (compareState.sort === 'quality') {
          const qualityOrder = (stats.get(right.key)?.quality ?? -1) - (stats.get(left.key)?.quality ?? -1);
          if (qualityOrder) return qualityOrder;
        }
        if (compareState.sort === 'release') {
          const releaseOrder = releaseChronologyKey(right).localeCompare(releaseChronologyKey(left));
          if (releaseOrder) return releaseOrder;
        }
        if (compareState.sort === 'value') {
          const valueOrder = (stats.get(right.key)?.value ?? -1) - (stats.get(left.key)?.value ?? -1);
          if (valueOrder) return valueOrder;
        }
        const modelOrder = optionModelFamily(left).localeCompare(optionModelFamily(right), 'de', { sensitivity: 'base' });
        if (modelOrder) return modelOrder;
        const typeOrder = optionTypes(left).join(', ').localeCompare(optionTypes(right).join(', '), 'de', { sensitivity: 'base' });
        if (typeOrder) return typeOrder;
        const backendOrder = String(left.backend || '').localeCompare(String(right.backend || ''), 'de', { sensitivity: 'base' });
        if (backendOrder) return backendOrder;
        return String(left.label || '').localeCompare(String(right.label || ''), 'de', { sensitivity: 'base' })
          || String(left.key || '').localeCompare(String(right.key || ''));
      });
    }

    function preselectionGroups() {
      const options = payload.release_matrix?.options || [];
      const availableBackends = new Set(options.map(option => String(option.backend || 'unbekannt')));
      // MLX is a real local runtime and remains selectable before its first valid profile.
      availableBackends.add('MLX');
      // "Lokal" is a convenience filter over the concrete local runtimes.
      availableBackends.add('Lokal');
      const backendOrder = ['Cloud', 'Lokal', 'Ollama', 'llama.cpp', 'MLX'];
      const backends = [...availableBackends]
        .sort((left, right) => {
          const leftRank = backendOrder.indexOf(left);
          const rightRank = backendOrder.indexOf(right);
          if (leftRank !== -1 || rightRank !== -1) {
            return (leftRank === -1 ? backendOrder.length : leftRank)
              - (rightRank === -1 ? backendOrder.length : rightRank);
          }
          return left.localeCompare(right, 'de', { sensitivity: 'base' });
        });
      const models = [...new Set(options.map(optionModelFamily))]
        .sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
      const types = [...new Set(options.flatMap(optionTypes))]
        .sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
      const capabilities = ['Text', 'Vision', 'Audio', 'Speech', 'Omni'];
      const parameter = ['McFly', 'Unsloth'];
      const ram = ['64', '32', '16', '8'];
      const data = (payload.release_matrix?.data_stands || []).map(stand => String(stand.key));
      if (options.some(option => !option.data_stand)) data.push('unbekannt');
      return { backend: backends, model: models, type: types, capability: capabilities, parameter, ram, data };
    }

    function isLocalBackend(backend) {
      return /^(Ollama|llama\.cpp|MLX|Transformers local)$/i.test(backend);
    }

    function optionMatchesPreselection(option, dataStandOverride = null) {
      const backend = String(option.backend || 'unbekannt');
      const backendMatches = !preselectionState.backend.size
        || preselectionState.backend.has(backend)
        || (preselectionState.backend.has('Lokal') && isLocalBackend(backend));
      const model = optionModelFamily(option);
      const types = optionTypes(option);
      const capabilities = optionCapabilityValues(option);
      const parameter = optionParameterProfile(option);
      const ramMatches = !preselectionState.ram.size
        || [...preselectionState.ram].some(ramGb => optionFitsRamSelection(option, ramGb));
      const dataStand = String(dataStandOverride || option.data_stand || 'unbekannt');
      const dataMatches = !preselectionState.data.size || preselectionState.data.has(dataStand);
      const isIncomplete = optionIncompleteCount(option) > 0;
      const completenessMatches = !compareState.incompleteOnly || isIncomplete;
      return dataMatches
        && ramMatches
        && backendMatches
        && (!preselectionState.model.size || preselectionState.model.has(model))
        && (!preselectionState.type.size || types.some(type => preselectionState.type.has(type)))
        && (!preselectionState.capability.size || capabilities.some(capability => preselectionState.capability.has(capability)))
        && (!preselectionState.parameter.size || preselectionState.parameter.has(parameter))
        && completenessMatches;
    }

    function filteredCompareOptions() {
      // Array.filter passes (value, index, array).  Do not pass the predicate
      // directly because its optional second argument is a data-stand override.
      return (payload.release_matrix?.options || []).filter(option => optionMatchesPreselection(option));
    }

    function preselectionChoiceHtml(group, value, label, selected) {
      return `<label class="preselection-choice${value === '__all__' ? ' preselection-choice-all' : ''}">
        <input type="checkbox" data-preselection-group="${esc(group)}" data-preselection-value="${esc(value)}"${selected ? ' checked' : ''}>
        <span>${esc(label)}</span>
      </label>`;
    }

    function renderPreselection() {
      const target = document.getElementById('comparisonPreselectionContent');
      if (!target) return;
      const groups = preselectionGroups();
      let removedUnavailableChoice = false;
      Object.entries(groups).forEach(([group, choices]) => {
        const available = new Set(choices);
        [...preselectionState[group]].forEach(value => {
          if (!available.has(value)) {
            preselectionState[group].delete(value);
            removedUnavailableChoice = true;
          }
        });
      });
      if (removedUnavailableChoice) {
        reconcileComparisonSelection();
        persistComparisonPreferences();
      }
      const labels = { ram: 'RAM-Evidenz', data: 'Datenstand', backend: 'Backend', model: 'Modellfamilie', type: 'Typ', capability: 'Fähigkeiten', parameter: 'Samplingprofil' };
      const dataStandLabels = Object.fromEntries((payload.release_matrix?.data_stands || []).map(stand => [stand.key, stand.label]));
      const groupHtml = group => {
        const choices = groups[group];
        const selected = preselectionState[group];
        const allChoice = preselectionChoiceHtml(group, '__all__', 'Alle', selected.size === 0);
        const values = choices.map(value => {
          const label = group === 'ram' && value !== 'unbekannt'
            ? `${value} GB`
            : group === 'data'
              ? (dataStandLabels[value] || 'Unbekannt')
              : group === 'model' && value === 'Nemotron 3 Nano' ? 'Nemotron' : group === 'model' && value === 'Devstral' ? 'Mistral' : value;
          return preselectionChoiceHtml(group, value, label, selected.has(value));
        }).join('');
        return `<section class="preselection-group"><h3>${labels[group]}</h3>${allChoice}${values}</section>`;
      };
      target.innerHTML = [
        `<div class="preselection-stack">${groupHtml('data')}${groupHtml('parameter')}</div>`,
        groupHtml('ram'),
        groupHtml('backend'),
        groupHtml('model'),
        groupHtml('type'),
        groupHtml('capability')
      ].join('');
      target.querySelectorAll('input[data-preselection-group]').forEach(input => {
        input.addEventListener('change', event => {
          const group = event.target.dataset.preselectionGroup;
          const value = event.target.dataset.preselectionValue;
          const selected = preselectionState[group];
          if (value === '__all__') {
            selected.clear();
          } else if (event.target.checked) {
            selected.add(value);
          } else {
            selected.delete(value);
          }
          renderPreselection();
          reconcileComparisonSelection();
          persistComparisonPreferences();
          render();
        });
      });
      const sort = document.getElementById('comparisonSort');
      sort.value = compareState.incompleteOnly ? 'incomplete' : compareState.sort;
      sort.onchange = event => {
        if (event.target.value === 'incomplete') {
          compareState.incompleteOnly = true;
          compareState.sort = 'value';
        } else {
          compareState.incompleteOnly = false;
          compareState.sort = event.target.value;
        }
        compareState.manualColumns = false;
        reconcileComparisonSelection();
        persistComparisonPreferences();
        render();
      };
      const columnCount = document.getElementById('comparisonColumnCount');
      const displayedColumnCount = compareState.activeColumnCount >= 2
        ? compareState.activeColumnCount
        : compareState.columnCount;
      columnCount.value = compareState.automaticColumns ? 'auto' : String(displayedColumnCount);
      columnCount.onchange = event => {
        compareState.automaticColumns = event.target.value === 'auto';
        if (!compareState.automaticColumns) compareState.columnCount = Number(event.target.value);
        compareState.manualColumns = false;
        reconcileComparisonSelection();
        persistComparisonPreferences();
        render();
      };
      document.getElementById('comparisonReset').onclick = () => {
        Object.values(preselectionState).forEach(selected => selected.clear());
        compareState.sort = 'release';
        compareState.incompleteOnly = false;
        compareState.manualColumns = false;
        compareState.columnCount = defaultComparisonColumnCount();
        compareState.automaticColumns = false;
        try { localStorage.removeItem(DASHBOARD_PREFERENCES_KEY); } catch (_error) {}
        reconcileComparisonSelection();
        renderPreselection();
        render();
      };
      updateComparisonMatchCount();
    }

    function updateComparisonMatchCount(options = filteredCompareOptions()) {
      const count = document.getElementById('comparisonMatchCount');
      if (count) count.textContent = `${options.length} passend, ${compareState.columns.filter(Boolean).length} angezeigt`;
    }

    function reconcileComparisonSelection() {
      const preserveColumns = restoredComparisonPreferences && compareState.manualColumns;
      restoredComparisonPreferences = false;
      const options = sortComparisonOptions(filteredCompareOptions());
      compareState.activeColumnCount = compareState.automaticColumns
        ? Math.min(options.length, 20)
        : Math.min(compareState.columnCount, Math.max(options.length, 1));
      if (preserveColumns) {
        const available = new Set(options.map(option => option.key));
        const retained = compareState.columns.filter(key => key && available.has(key));
        const additions = options.map(option => option.key).filter(key => !retained.includes(key));
        compareState.columns = retained.concat(additions).slice(0, compareState.activeColumnCount);
      } else {
        compareState.columns = options.slice(0, compareState.activeColumnCount).map(option => option.key);
      }
      ensureCompareColumns();
      updateComparisonMatchCount(options);
    }

    // Presentation only: preserve exact release metadata and chronological keys.
    function releaseChronologyKey(option) {
      const value = String(option.release_date || option.release_month || '').replaceAll('/', '-');
      // Month-only precision stays YYYY-MM: no invented release day or Date/mtime fallback.
      return /^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(value) ? value : '';
    }

    function ramClassDisplay(option) {
      const gb = optionRamRequirement(option);
      const evidence = (option.capacity_evidence || []).filter(item =>
        Number(item.target_memory_gb) === gb && ['confirmed_fit', 'projected_fit'].includes(item.admission_status));
      if (gb === null || !evidence.length || String(option.backend) === 'Cloud')
        return { label: 'nicht belegt', title: 'Keine gültige profilgebundene RAM-Kapazitätsevidenz; keine Speicherbedarfsschätzung.' };
      const confirmed = evidence.some(item => item.admission_status === 'confirmed_fit');
      return { label: `${gb} GB`, title: `${confirmed ? 'Hardwarebestätigt' : 'Nur projiziert; nicht auf physischer Zielhardware bestätigt'} · ${evidence.map(item => item.label || item.evidence_level || 'belegt').join('; ')}` };
    }

    function releaseMonthDisplay(option) {
      const value = String(option.release_date || option.release_month || '');
      const month = value.match(/^(\d{4})[-/](0[1-9]|1[0-2])(?:$|[-/]\d{2}$)/);
      return month ? `${month[1]}/${month[2]}` : 'nicht belegt';
    }

    function compareOptionHtml(selected) {
      const options = filteredCompareOptions();
      return '<option value="">Leer</option>' + options.map(option => {
        const label = `${option.backend} - ${option.label}`;
        return `<option value="${esc(option.key)}" ${option.key === selected ? 'selected' : ''}>${esc(label)}</option>`;
      }).join('');
    }

    function compareSelectHtml(selected, index) {
      return `<select id="compare${index}" aria-label="Vergleichsmodell ${index + 1}">
        ${compareOptionHtml(selected)}
      </select>`;
    }

    function ensureCompareColumns() {
      compareState.columns = compareState.columns.slice(0, compareState.activeColumnCount);
      while (compareState.columns.length < compareState.activeColumnCount) {
        compareState.columns.push('');
      }
    }

    function bindCompareSelects() {
      compareState.columns.forEach((_, index) => {
        document.getElementById(`compare${index}`).addEventListener('change', event => {
          compareState.columns[index] = event.target.value;
          compareState.manualColumns = true;
          persistComparisonPreferences();
          render();
        });
      });
    }

    function matrixWinners(row, selectedKeys) {
      const values = selectedKeys
        .map(key => [key, row.values[key]])
        .filter(([, value]) => value && value.total);
      if (!values.length) return { quality: new Set(), speed: new Set(), value: new Set() };

      const bestRate = Math.max(...values.map(([, value]) => valuePassRate(value)));
      const bestPassed = Math.max(...values.filter(([, value]) => valuePassRate(value) === bestRate).map(([, value]) => value.passed));
      const quality = new Set(
        values
          .filter(([, value]) => valuePassRate(value) === bestRate && value.passed === bestPassed)
          .map(([key]) => key)
      );

      const timed = values.filter(([, value]) => speedEligible(value));
      const bestTime = timed.length ? Math.min(...timed.map(([, value]) => value.duration_ms)) : null;
      const speed = new Set(bestTime === null ? [] : timed.filter(([, value]) => value.duration_ms === bestTime).map(([key]) => key));
      const valueScores = timed.map(([key, value]) => [key, Math.pow(valuePassRate(value), 2) * (bestTime / value.duration_ms)]);
      // "Qualität/Tempo" is a relative quality-weighted speed label. One eligible model is not a
      // comparison and must therefore never receive the badge by default.
      const bestValue = valueScores.length >= 2 ? Math.max(...valueScores.map(([, score]) => score)) : null;
      const value = new Set(bestValue === null ? [] : valueScores.filter(([, score]) => score === bestValue).map(([key]) => key));
      return { quality, speed, value };
    }

    const displayScore = (value) => value.score ?? (value.passed * 2 + (value.partial || 0));
    const displayMaxScore = (value) => value.max_score ?? (value.total * 2);
    const displayScoreRate = (value) => {
      const maxScore = displayMaxScore(value);
      return maxScore ? displayScore(value) / maxScore : -1;
    };
    const bestScoreGroupValue = (values) => {
      const eligible = values.filter(value => value && !value.not_applicable && displayMaxScore(value));
      if (!eligible.length) return null;
      return eligible.sort((a, b) => {
        const rateDelta = valuePassRate(b) - valuePassRate(a);
        if (rateDelta) return rateDelta;
        const passDelta = (b.passed || 0) - (a.passed || 0);
        if (passDelta) return passDelta;
        return (a.duration_ms || Number.MAX_SAFE_INTEGER) - (b.duration_ms || Number.MAX_SAFE_INTEGER);
      })[0];
    };
    const addTotalValue = (total, value) => {
      total.passed += value.passed;
      total.total += value.total;
      total.partial += value.partial || 0;
      total.score += displayScore(value);
      total.max_score += displayMaxScore(value);
      total.duration_ms += value.duration_ms || 0;
      total.categories += 1;
      if (value.complete === false) total.incomplete += 1;
    };
    const CORE_DIRECT_CATEGORIES = ['portal_safety', 'agent_tasks', 'tool_calling', 'coding', 'vision'];
    const CORE_REASONING_CATEGORIES = new Set(['reasoning', 'reasoning_tools']);
    const coreTimedTotals = (rows, selectedKeys) => {
      // A total badge is earned from a model's own complete core suite.
      // A pending specialist result in another visible column must never
      // remove a completed core model from the time/efficiency comparison.
      // N/A is a resolved capability boundary, unlike a pending category.
      const totals = Object.fromEntries(selectedKeys.map(key => [key, {
        passed: 0, total: 0, duration_ms: 0, categories: 0
      }]));
      const directRows = Object.fromEntries(CORE_DIRECT_CATEGORIES.map(category => [
        category, rows.find(row => row.category === category && !row.score_group)
      ]));
      const reasoningRows = rows.filter(row => row.score_group && CORE_REASONING_CATEGORIES.has(row.category));
      const resolved = (value) => value && !value.pending && (
        value.not_applicable || (value.total && speedEligible(value))
      );
      const eligible = [];
      selectedKeys.forEach(key => {
        const directValues = CORE_DIRECT_CATEGORIES.map(category => directRows[category]?.values?.[key]);
        const reasoningValue = bestScoreGroupValue(reasoningRows.map(row => row.values[key]).filter(Boolean));
        if (!directValues.every(resolved) || !resolved(reasoningValue)) return;
        [...directValues, reasoningValue].forEach(value => {
          if (value.not_applicable) return;
          const total = totals[key];
          total.passed += value.passed;
          total.total += value.total;
          total.duration_ms += value.duration_ms;
          total.categories += 1;
        });
        eligible.push(key);
      });
      return { entries: eligible.map(key => [key, totals[key]]), categories: CORE_DIRECT_CATEGORIES.length + 1 };
    };

    let matrixHeaderResizeObserver;
    function renderMatrix() {
      const matrix = payload.release_matrix;
      const options = compareOptionsByKey();
      ensureCompareColumns();
      const columnKeys = compareState.columns.slice(0, compareState.activeColumnCount);
      const selectedKeys = columnKeys.filter(Boolean);
      const fmtGiB = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
        ? `${(Number(value) / (1024 ** 3)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GiB`
        : 'nicht erfasst';
      const targetRamLabel = (option) => option.target_ram_gb
        ? `${esc(option.target_ram_gb)} GB`
        : 'nicht festgelegt';
      const capacityEvidenceHtml = (option) => {
        const entries = option.capacity_evidence || [];
        if (!entries.length) {
          const target = option.target_ram_gb ? `${option.target_ram_gb} GB ` : '';
          return `<span class="ram-fit"><span class="ram-chip ram-open">${esc(target)}Gate offen</span></span>`;
        }
        return `<span class="ram-fit">${entries.map(item => {
          const admission = String(item.admission_status || '');
          const css = admission === 'confirmed_fit' ? 'good'
            : admission === 'projected_fit' ? 'warn'
            : admission === 'legacy_measurement' ? 'open' : 'bad';
          const status = admission === 'confirmed_fit' ? 'hardwarebestätigt'
            : admission === 'projected_fit' ? 'projiziert'
            : admission === 'legacy_measurement' ? 'Alt-Messung' : 'passt nicht';
          return `<span class="ram-chip ram-${css}">${esc(item.target_memory_gb)} GB ${status}</span>`;
        }).join('')}</span>`;
      };
      const capacityEvidenceDetailHtml = (option) => {
        const entries = option.capacity_evidence || [];
        if (!entries.length) return '<span class="model-params">Messwerte: nicht vorhanden</span>';
        return entries.map(item => {
          const sourceHost = item.source_host_memory_gb ? ` · Quellhost ${item.source_host_memory_gb} GB` : '';
          const reserve = item.reserve_memory_gb ? ` · Reserve ${item.reserve_memory_gb} GiB` : '';
          return `<span class="model-params">${esc(item.target_memory_gb)} GB: Peak ${fmtGiB(item.peak_capacity_bytes)}${esc(reserve)} · Peak + Reserve ${fmtGiB(item.peak_plus_reserve_bytes)}${esc(sourceHost)}</span>`;
        }).join('');
      };
      const commaBreakHtml = (value) => {
        const text = String(value || '-');
        if (text === '-') return esc(text);
        return text.split(/,\s*/).map((part, index, parts) => {
          const suffix = index < parts.length - 1 ? ',' : '';
          return `<span class="model-param-segment">${esc(part)}${suffix}</span>`;
        }).join(' ');
      };
      const modelDetailCardHtml = (option) => {
        const suitability = option.suitability === 'praktisch_unpassend_64gb_m_chip'
          ? `<span class="model-params" title="${esc(option.suitability_detail || '')}">Nicht passend: 64GB M-Chip</span>` : '';
        const profileTraits = [...new Set([...optionTypes(option), ...optionCapabilityValues(option)])].join(' · ');
        return `<div class="model-detail-card">
          <section class="model-detail-group"><h4>Profil und Fähigkeiten</h4>
            <span class="model-params">Profil: ${esc(profileTraits || 'nicht erfasst')}</span>
            <span class="model-params">Architektur: ${esc(option.model_architecture || 'nicht erfasst')}</span>
            <span class="model-params">Parameter B (gesamt/aktiv): ${esc(option.parameter_scale || '-').replace(/B/g, '')}</span>
            <span class="model-params">Quantisierung: ${esc(option.quant || '-')}</span>
            <span class="model-params">Samplingprofil: ${esc(optionParameterProfile(option))}</span>
          </section>
          <section class="model-detail-group"><h4>RAM und Runtime</h4>
            <span class="model-params">Zielklasse: ${targetRamLabel(option)}</span>
            <span class="model-params">Evidenz: ${capacityEvidenceHtml(option)}</span>
            ${capacityEvidenceDetailHtml(option)}
            <span class="model-params">Lokal vorhanden: ${esc(option.model_file_size || 'nicht erfasst')}</span>
            <span class="model-params">Runtime: ${esc(option.runtime_size_note || 'nicht erfasst')}</span>
            ${suitability}
          </section>
          <section class="model-detail-group"><h4>Benchmarkvertrag</h4>
            <span class="model-params">Modellprofil: ${esc(option.served_model || 'nicht erfasst')}</span>
            <span class="model-params">Backend-Version: ${esc(option.backend_version || 'nicht im Laufartefakt erfasst')}</span>
            <span class="model-params">Letzter Kategorie-Lauf: ${esc(fmtDateTime(option.latest_benchmark_at))}</span>
            <span class="model-params">Datenstand: ${esc(Object.fromEntries((payload.release_matrix?.data_stands || []).map(stand => [stand.key, stand.label]))[option.data_stand] || 'unbekannt')}${option.suite_version ? ` · Cases v${option.suite_version}` : ''}</span>
            <span class="model-params">Passiv: ${commaBreakHtml(option.passive_params || '-')}</span>
            <span class="model-params">Aktiv: ${commaBreakHtml(option.active_params || '-')}</span>
          </section>
          <section class="model-detail-group"><h4>Herkunft</h4>
            <span class="model-params">Hersteller: ${esc(option.manufacturer || 'nicht erfasst')} · ${esc(option.origin || 'Herkunft nicht erfasst')}</span>
            <span class="model-params">Lizenz: ${esc(option.model_license || 'nicht erfasst')}</span>
            <details class="technical-provenance"><summary>Technische Provenienz</summary>
              <span class="model-params">Modellquelle: ${esc(option.model_repo || 'nicht erfasst')}</span>
              <span class="model-params">Revision: ${esc(option.model_revision || 'nicht erfasst')}</span>
            </details>
          </section>
        </div>`;
      };
      const modelDetailsCells = columnKeys.map((key) => {
        if (!key) return `<th class="model-detail-cell"><span class="muted">Kein Modell ausgewaehlt.</span></th>`;
        const option = options[key] || {};
        return `<th class="model-detail-cell">${modelDetailCardHtml(option)}</th>`;
      }).join('');
      const headerRows = `
        <tr><th>Modell</th>${columnKeys.map(key => {
          if (!key) return `<th><span class="muted">Kein Modell ausgewaehlt.</span></th>`;
          const option = options[key] || {};
          return `<th><div class="model-header-meta">
            <span class="model-header-line model-label-value">${esc(option.label || key)}</span>
            <span class="model-header-line">Backend: ${esc(option.backend || '-')}</span>
            <span class="model-header-line model-ram-class" title="${esc(ramClassDisplay(option).title)}">RAM Klasse: ${esc(ramClassDisplay(option).label)}</span>
            <span class="model-release" title="${esc(option.release_basis || 'Historische Modellmonatsangabe; Tagesbeleg nicht erfasst')}">Release Datum: ${option.release_source ? `<a href="${esc(option.release_source)}" target="_blank" rel="noopener noreferrer">${esc(releaseMonthDisplay(option))}</a>` : esc(releaseMonthDisplay(option))}</span>
          </div></th>`;
        }).join('')}</tr>
        <tr class="matrix-group-row matrix-detail-toggle"><td colspan="${columnKeys.length + 1}">
          <details class="model-details" ontoggle="this.closest('tr').nextElementSibling.classList.toggle('details-collapsed', !this.open);">
            <summary class="matrix-group-toggle"><span class="matrix-group-icon" aria-hidden="true"></span>Details</summary>
          </details>
        </td></tr>
        <tr class="matrix-detail-row details-collapsed"><th></th>${modelDetailsCells}</tr>
      `;
      const CATEGORY_DISPLAY_NAMES = {
        portal_safety: 'Portal Safety',
        live_duckduckgo: 'Web Search & Repair',
        agent_tasks: 'Agent Tasks',
        tool_calling: 'Tool Use',
        coding: 'Coding',
        vision: 'Vision',
        audio: 'Audio',
        speech: 'Speech'
      };
      const REASONING_DISPLAY_NAMES = {
        no_thinking_no_tools: 'no-thinking\nno-tools',
        no_thinking_tools: 'no-thinking\ntools',
        thinking_no_tools: 'thinking\nno-tools',
        thinking_tools: 'thinking\ntools'
      };
      const CATEGORY_INFO = {
        portal_safety: { title: 'Portal Safety', text: 'Prüft sichere, quellengebundene Antworten im lokalen Wissensportal. Gewertet werden Aufgabenpass und die Einhaltung der Sicherheits- und Quellenregeln.' },
        live_duckduckgo: { title: 'Web Search & Repair', text: 'Prüft echte Recherche- und Reparaturaufgaben mit Live DuckDuckGo. Gewertet wird, ob der Agent die Aufgabe gezielt untersucht, korrekt löst und das Ergebnis belegt.' },
        agent_tasks: { title: 'Agent Tasks', text: 'Prüft mehrstufige Arbeitsaufträge: Ziel erfassen, Dateien und Hinweise auswerten, Änderungen korrekt ableiten und ein verwertbares Ergebnis liefern.' },
        tool_calling: { title: 'Tool Use', text: 'Prüft Auswahl, Reihenfolge und Parameter von Werkzeugaufrufen. Eine Aufgabe zählt nur, wenn die erforderlichen Tool-Schritte korrekt ausgeführt werden.' },
        coding: { title: 'Coding', text: 'Prüft konkrete Programmieraufgaben gegen sichtbare und versteckte Tests. Gewertet wird der ausführbare Ergebniszustand, nicht nur eine plausible Erklärung.' },
        vision: { title: 'Vision', text: 'Prüft Bildverständnis und visuelle Aufgaben. Nicht unterstützte Bildeingaben erscheinen als N/A; in der gemeinsamen Qualitätsquote liefern sie keine bestandenen Aufgaben.' },
        audio: { title: 'Audio', text: 'Prüft Audioverständnis. Nicht unterstützte Audioeingaben erscheinen als N/A; in der gemeinsamen Qualitätsquote liefern sie keine bestandenen Aufgaben.' },
        speech: { title: 'Speech', text: 'Prüft Sprachverständnis und gesprochene Eingaben. Nicht unterstützte Spracheingaben erscheinen als N/A; in der gemeinsamen Qualitätsquote liefern sie keine bestandenen Aufgaben.' },
        reasoning: { title: 'Reasoning ohne Tools', text: 'Prüft strukturiertes Schlussfolgern ohne externe Werkzeuge. Je Profil wird nur die passende Thinking- oder No-Thinking-Variante in die Summe übernommen.' },
        reasoning_tools: { title: 'Reasoning mit Tools', text: 'Prüft strukturiertes Schlussfolgern mit Werkzeugen. Je Profil wird nur die passende Thinking- oder No-Thinking-Variante in die Summe übernommen.' }
      };
      const categoryLabel = row => {
        const info = CATEGORY_INFO[row.category];
        const displayName = REASONING_DISPLAY_NAMES[row.reasoning_variant]
          || CATEGORY_DISPLAY_NAMES[row.category] || row.label || row.category;
        const label = `<code class="category-code">${esc(displayName)}</code>`;
        if (!info) return label;
        return `<span class="category-label">${label}<button type="button" class="summary-info-button" data-matrix-info="category_${esc(row.category)}" aria-label="Erklärung zu ${esc(info.title)}">i</button></span>`;
      };
      const categoryRowHtml = row => {
        const winners = matrixWinners(row, selectedKeys);
        const cells = columnKeys.map(key => {
          if (!key) return '<td class="matrix-cell"><span class="matrix-rate matrix-rate-open">offen</span></td>';
          const value = row.values[key];
          if (!value) return '<td class="matrix-cell"><span class="matrix-rate matrix-rate-open">offen</span></td>';
          if (value.pending) {
            return matrixValueHtml(value, '', '');
          }
          if (value.not_applicable) {
            return matrixValueHtml(value, '', '');
          }
          const quality = winners.quality.has(key) ? '<span class="win win-quality">Qualitaet</span>' : '';
          const speed = winners.speed.has(key) ? '<span class="win win-speed">Zeit</span>' : '';
          const valueBadge = winners.value.has(key) ? '<span class="win win-value">Qualität/Tempo</span>' : '';
          return matrixValueHtml(value, quality, speed + valueBadge);
        }).join('');
        return `<td>${categoryLabel(row)}</td>${cells}`;
      };

      const SUMMARY_BLOCKS = [
        {
          id: 'praxis', label: 'Summe: Praxis', categories: new Set(['portal_safety', 'live_duckduckgo']),
          info: 'Praxis umfasst Portal Safety und Agent-Recovery (Live DuckDuckGo). Die Quote verwendet die erwartete Aufgabenbasis beider Kategorien; fehlende, laufende oder N/A-Suiten liefern keine bestandenen Aufgaben.'
        },
        {
          id: 'core', label: 'Summe: Core', categories: new Set(['agent_tasks', 'tool_calling', 'coding']),
          info: 'Core umfasst Agent-Aufgaben, Tool-Aufrufe und Coding. Die Quote verwendet die erwartete Aufgabenbasis aller drei Kategorien; fehlende, laufende oder N/A-Suiten liefern keine bestandenen Aufgaben.'
        },
        {
          id: 'media', label: 'Summe: Media', categories: new Set(['vision', 'audio', 'speech']),
          info: 'Media umfasst Vision, Audio und Speech. Auch eine dokumentierte N/A-Fähigkeitsgrenze liefert in der gemeinsamen Qualitätsquote keine bestandenen Aufgaben; sie wird aber nicht als technischer Laufzeitfehler dargestellt.'
        },
        {
          id: 'reasoning', label: 'Summe: Reasoning', categories: new Set(['reasoning', 'reasoning_tools']),
          info: 'Reasoning umfasst Tests ohne und mit Tools. Je Profil zählt ausschließlich die passende Thinking- oder No-Thinking-Variante; fehlende, laufende oder N/A-Suiten liefern keine bestandenen Aufgaben.'
        }
      ];
      const LIVE_CANDIDATE_BLOCK = {
        id: 'live_candidate',
        label: 'Live-Test-Kandidat',
        categories: new Set(['portal_safety', 'agent_tasks', 'tool_calling', 'coding', 'reasoning_tools']),
        info: 'Grobe fachliche Vorauswahl für einen überwachten Live-Test: Portal Safety, Agent Tasks, Tool Use, Coding und Reasoning mit Tools. Medien, Reasoning ohne Tools und der enge DuckDuckGo-Recoveryfall sind Zusatzmerkmale. Die Zeile ersetzt weder den bestandenen RAM-/Kontext-Smoke auf echter 16/32/64-GB-Hardware noch eine Produktionsfreigabe.'
      };
      // A summary must use the same task base for every model.  Otherwise a
      // model without (for example) vision support could look better simply
      // because its unsupported tasks were removed from the denominator.
      const benchmarkTaskTotal = row => {
        const values = Object.values(row.values || {}).filter(Boolean);
        const expected = values
          .map(value => Number(value.expected_total) || 0)
          .filter(total => total > 0);
        if (expected.length) return Math.max(...expected);
        const observed = values
          .map(value => Number(value.total) || 0)
          .filter(total => total > 0);
        return observed.length ? Math.max(...observed) : 0;
      };
      const isThinkingProfile = key => {
        const option = options[key] || {};
        const text = [key, option.label, option.model].filter(Boolean).join(' ').toLowerCase();
        return !/(no[-_ ]thinking)/.test(text) && text.includes('thinking');
      };
      const summaryRows = (block, key) => {
        const rows = matrix.rows.filter(row => block.categories.has(row.category));
        if (block.id !== 'reasoning' && block.id !== 'live_candidate') return rows;
        const prefix = isThinkingProfile(key) ? 'thinking_' : 'no_thinking_';
        return rows.filter(row =>
          !['reasoning', 'reasoning_tools'].includes(row.category)
          || String(row.reasoning_variant || '').startsWith(prefix)
        );
      };
      const summaryValue = (block, key) => {
        const rows = summaryRows(block, key);
        const values = rows
          .map(row => row.values[key])
          .filter(value => value && !value.pending && !value.not_applicable && value.total);
        const total = rows.reduce((sum, row) => sum + benchmarkTaskTotal(row), 0);
        if (!total) return null;
        const timed = values.filter(speedEligible);
        // Time and efficiency use the available, completed suite runs.  The
        // quality denominator remains the common task base of all suites.
        // Runtime remains useful diagnostic information even when a partial
        // result is not eligible for a speed/efficiency comparison.
        const measured = values.filter(value => Number.isFinite(value.duration_ms) && value.duration_ms > 0);
        return {
          passed: values.reduce((sum, value) => sum + value.passed, 0),
          total,
          duration_ms: measured.length ? measured.reduce((sum, value) => sum + value.duration_ms, 0) : null,
          // Match a category row: every completed, time-eligible suite
          // contributes its measured model time.  A missing, pending, N/A,
          // or non-time-eligible suite must not erase another suite's valid
          // runtime from the summary comparison.
          comparable_duration_ms: timed.length
            ? timed.reduce((sum, value) => sum + value.duration_ms, 0)
            : null,
          suite_count: values.length,
          expected_suites: block.categories.size
        };
      };
      const benchmarkCoverage = key => {
        const categories = [
          'portal_safety', 'live_duckduckgo', 'agent_tasks', 'tool_calling', 'coding',
          'vision', 'audio', 'speech', 'reasoning', 'reasoning_tools'
        ];
        const prefix = isThinkingProfile(key) ? 'thinking_' : 'no_thinking_';
        const coverage = { measured: 0, notApplicable: 0, stale: 0, open: 0, total: categories.length };
        categories.forEach(category => {
          const matchingRows = matrix.rows.filter(row => row.category === category);
          const row = ['reasoning', 'reasoning_tools'].includes(category)
            ? matchingRows.find(entry => String(entry.reasoning_variant || '').startsWith(prefix))
            : matchingRows.find(entry => !entry.score_group) || matchingRows[0];
          const value = row?.values?.[key];
          if (value?.stale) coverage.stale += 1;
          else if (!value || value.pending) coverage.open += 1;
          else if (value.not_applicable) coverage.notApplicable += 1;
          else coverage.measured += 1;
        });
        return coverage;
      };
      const summaryInfoLabel = () => `<span class="summary-label"><strong>Summe</strong><button type="button" class="summary-info-button" data-matrix-info="total" aria-label="Erklärung zur Summe">i</button></span>`;
      const summaryInfo = 'Die Summe besteht aktuell aus Praxis (2 Kategorien), Core (3), Media (3) und Reasoning (2). Qualität und Qualität/Tempo verwenden für jedes Profil dieselbe vollständige Aufgabenbasis: Es zählen exakt bestandene Aufgaben ohne Teilpunkte; fehlende, laufende oder N/A-Suiten liefern keine bestandenen Aufgaben. Bei Reasoning zählt je Profil ausschließlich die passende Thinking- oder No-Thinking-Variante. Modelllaufzeit zeigt alle gemessenen abgeschlossenen Suiten. Zeit ist aktive Modellzeit je tatsächlich ausgeführter Aufgabe; Qualität/Tempo ist die vollständige Aufgabenquote im Quadrat geteilt durch diese normalisierte Zeit.';
      const matrixInfoById = Object.fromEntries(Object.entries(CATEGORY_INFO).map(([id, info]) => [`category_${id}`, info]));
      matrixInfoById.total = { title: 'Summe', text: summaryInfo };
      matrixInfoById.live_candidate = { title: 'Live-Test-Kandidat', text: LIVE_CANDIDATE_BLOCK.info };
      const summaryTotals = selectedKeys.map(key => {
        const values = SUMMARY_BLOCKS.map(block => summaryValue(block, key)).filter(Boolean);
        // A fully N/A block has no runtime by definition.  Its absence must
        // not hide the diagnostic total runtime of the blocks that ran.
        const measuredValues = values.filter(value => value.duration_ms);
        if (!values.length) return [key, null];
        return [key, {
          passed: values.reduce((sum, value) => sum + value.passed, 0),
          total: values.reduce((sum, value) => sum + value.total, 0),
          duration_ms: measuredValues.length ? measuredValues.reduce((sum, value) => sum + value.duration_ms, 0) : null,
          // As in category rows, form the time comparison from all available
          // eligible measurements.  Quality deliberately keeps the common
          // task base above, so unavailable suites cannot improve its rate.
          comparable_duration_ms: values.some(value => value.comparable_duration_ms)
            ? values.reduce((sum, value) => sum + (value.comparable_duration_ms || 0), 0)
            : null
        }];
      }).filter(([, value]) => value);
      // Summary badges and column sorting deliberately share one comparison
      // basis: exact passes on the complete fixed task base and active model
      // time normalized per task that actually ran.
      const summaryWinners = comparisonWinners(filteredCompareOptions(), selectedKeys);
      const totalCells = columnKeys.map(key => {
        if (!key) return '<td class="matrix-cell"><span class="matrix-rate matrix-rate-open">offen</span></td>';
        const value = summaryTotals.find(([entryKey]) => entryKey === key)?.[1];
        if (!value) return '<td class="matrix-cell"><span class="matrix-rate matrix-rate-open">offen</span></td>';
        const rate = value.passed / value.total;
        const breakdown = SUMMARY_BLOCKS.map(block => {
          const blockValue = summaryValue(block, key);
          if (!blockValue) return `<span>${esc(block.label.replace('Summe: ', ''))}: offen</span>`;
          const blockRate = blockValue.passed / blockValue.total * 100;
          return `<span>${esc(block.label.replace('Summe: ', ''))}: <strong>${fmtInt(blockValue.passed)}/${fmtInt(blockValue.total)}</strong> Aufgaben · ${blockRate.toFixed(1)}%</span>`;
        }).join('');
        const quality = summaryWinners.quality.has(key) ? '<span class="win win-quality">Qualitaet</span>' : '';
        const speed = summaryWinners.speed.has(key) ? '<span class="win win-speed">Zeit</span>' : '';
        const valueBadge = summaryWinners.value.has(key) ? '<span class="win win-value">Qualität/Tempo</span>' : '';
        const coverage = benchmarkCoverage(key);
        const coverageText = `Gesamtbenchmark: ${coverage.measured} gemessen · ${coverage.notApplicable} N/A · ${coverage.stale} veraltet · ${coverage.open} offen`;
        return `<td class="matrix-cell"><span class="matrix-rate ${rateClass(value)}">${(rate * 100).toFixed(1)}%</span><div class="matrix-goals summary-tasks"><strong>${fmtInt(value.passed)}/${fmtInt(value.total)}</strong> Aufgaben</div><span class="matrix-duration summary-runtime">Modelllaufzeit: ${value.duration_ms ? fmtMs(value.duration_ms) : 'nicht erfasst'}</span><span class="matrix-duration">${esc(coverageText)}</span><div class="summary-breakdown">${breakdown}</div><div class="matrix-badges">${quality}${speed}${valueBadge || '&nbsp;'}</div></td>`;
      }).join('');
      const candidateCells = columnKeys.map(key => {
        if (!key) return '<td class="matrix-cell"><span class="matrix-rate matrix-rate-open">offen</span></td>';
        const value = summaryValue(LIVE_CANDIDATE_BLOCK, key);
        if (!value) return '<td class="matrix-cell"><span class="matrix-rate matrix-rate-open">offen</span></td>';
        const rate = value.passed / value.total;
        const completeness = value.suite_count === value.expected_suites
          ? `Kandidatenkern vollständig · ${value.suite_count}/${value.expected_suites} Suiten`
          : `Kandidatenkern: ${value.suite_count}/${value.expected_suites} Suiten vorhanden`;
        const ramEvidence = (options[key]?.capacity_evidence || []).map(item => item.label).join(' · ');
        const ramStatus = ramEvidence || 'RAM-Evidenz offen';
        return `<td class="matrix-cell"><span class="matrix-rate ${rateClass(value)}">${(rate * 100).toFixed(1)}%</span><div class="matrix-goals"><strong>${fmtInt(value.passed)}/${fmtInt(value.total)}</strong> Aufgaben</div><span class="matrix-duration">${esc(completeness)} · RAM-Gate separat: ${esc(ramStatus)}</span></td>`;
      }).join('');
      let collapsedMatrixGroups = {};
      try {
        collapsedMatrixGroups = JSON.parse(localStorage.getItem('benchmark-dashboard.matrix-groups') || '{}') || {};
      } catch (_error) {
        collapsedMatrixGroups = {};
      }
      const groupedCategories = new Set(SUMMARY_BLOCKS.flatMap(block => [...block.categories]));
      const candidateLabel = `<span class="summary-label"><strong>Live-Test-Kandidat</strong><button type="button" class="summary-info-button" data-matrix-info="live_candidate" aria-label="Erklärung zum Live-Test-Kandidaten">i</button></span>`;
      const resultCollapsed = collapsedMatrixGroups.ergebnis === true;
      const rows = [
        `<tr class="matrix-group-row"><td colspan="${columnKeys.length + 1}"><button type="button" class="matrix-group-toggle" data-matrix-group-toggle="ergebnis" aria-expanded="${!resultCollapsed}"><span class="matrix-group-icon">${resultCollapsed ? '▸' : '▾'}</span>Ergebnis</button></td></tr>`,
        `<tr class="summary-row live-candidate-row" data-matrix-group="ergebnis"${resultCollapsed ? ' hidden' : ''}><td>${candidateLabel}</td>${candidateCells}</tr>`,
        `<tr class="summary-row" data-matrix-group="ergebnis"${resultCollapsed ? ' hidden' : ''}><td>${summaryInfoLabel()}</td>${totalCells}</tr>`
      ];
      SUMMARY_BLOCKS.forEach(block => {
        const blockRows = matrix.rows.filter(row => block.categories.has(row.category));
        if (!blockRows.length) return;
        const collapsed = collapsedMatrixGroups[block.id] === true;
        const icon = collapsed ? '▸' : '▾';
        rows.push(`<tr class="matrix-group-row"><td colspan="${columnKeys.length + 1}"><button type="button" class="matrix-group-toggle" data-matrix-group-toggle="${block.id}" aria-expanded="${!collapsed}"><span class="matrix-group-icon">${icon}</span>${esc(block.label.replace('Summe: ', ''))} <small>${blockRows.length} Kategorien</small></button></td></tr>`);
        blockRows.forEach(row => rows.push(`<tr data-matrix-group="${block.id}"${collapsed ? ' hidden' : ''}>${categoryRowHtml(row)}</tr>`));
      });
      matrix.rows
        .filter(row => !groupedCategories.has(row.category))
        .forEach(row => rows.push(`<tr>${categoryRowHtml(row)}</tr>`));

      const matrixTable = document.getElementById('matrixTable');
      const fittedColumns = columnKeys.length || 1;
      const matrixColumnLabelShare = (columnCount = fittedColumns) => {
        const narrow = window.innerWidth <= 480;
        if (columnCount >= 8) return narrow ? 10 : 14;
        return narrow ? 12 : 16;
      };
      const colgroup = `<colgroup><col class="matrix-corner-col">${columnKeys.map(() => `<col class="matrix-data-col">`).join('')}</colgroup>`;
      matrixTable.style.width = '100%';
      matrixTable.style.minWidth = '0';
      matrixTable.style.maxWidth = '100%';
      matrixTable.style.setProperty('--matrix-cols', String(fittedColumns));
      matrixTable.innerHTML = `
        ${colgroup}
        <thead>${headerRows}</thead>
        <tbody>${rows.join('')}</tbody>
      `;
      const matrixSelectShift = document.getElementById('matrixSelectShift');
      if (matrixSelectShift) {
        matrixSelectShift.innerHTML = `<div class="matrix-select-label">Auswahl</div>${columnKeys.map((key, index) => `<div class="matrix-select-cell">${compareSelectHtml(key, index)}</div>`).join('')}`;
      }
      const matrixWrap = document.getElementById('matrixWrap');
      matrixHeaderResizeObserver?.disconnect();
      if (matrixWrap) {
        const syncMatrixSelectBar = () => {
          const bar = document.getElementById('matrixSelectBar');
          const shift = document.getElementById('matrixSelectShift');
          if (!bar || !shift) return;
          const cols = Number(matrixTable.style.getPropertyValue('--matrix-cols')) || columnKeys.length || 1;
          const hostWidth = matrixWrap.clientWidth || bar.clientWidth;
          if (!hostWidth) return;
          const labelShare = matrixColumnLabelShare(cols);
          let labelWidth = Math.round(hostWidth * (labelShare / 100));
          let remain = hostWidth - labelWidth;
          let dataWidth = Math.floor(remain / cols);
          const dataWidths = Array.from({ length: cols }, (_, index) => {
            if (index === cols - 1) return Math.max(0, remain - dataWidth * (cols - 1));
            return dataWidth;
          });
          const colElements = matrixTable.querySelectorAll('colgroup col');
          if (colElements[0]) colElements[0].style.width = `${labelWidth}px`;
          dataWidths.forEach((width, index) => {
            const col = colElements[index + 1];
            if (col) col.style.width = `${width}px`;
          });
          shift.style.width = '100%';
          shift.style.minWidth = '0';
          shift.style.maxWidth = '100%';
          shift.style.transform = 'none';
          shift.style.gridTemplateColumns = `${labelWidth}px ${dataWidths.map((width) => `${width}px`).join(' ')}`;
          matrixWrap.style.setProperty('--matrix-cols', String(cols));
          const rail = document.querySelector('.rail');
          let top = 0;
          if (rail) {
            const railBox = rail.getBoundingClientRect();
            const barBox = bar.getBoundingClientRect();
            const overlaps = railBox.right > barBox.left + 4 && railBox.left < barBox.right - 4;
            if (overlaps && railBox.bottom > 0 && railBox.top < window.innerHeight / 2) top = railBox.bottom + 8;
          }
          bar.style.top = `${top}px`;
        };
        matrixHeaderResizeObserver = new ResizeObserver(syncMatrixSelectBar);
        matrixHeaderResizeObserver.observe(matrixWrap);
        matrixHeaderResizeObserver.observe(matrixTable);
        matrixWrap._matrixSelectSync = syncMatrixSelectBar;
        if (!matrixWrap._matrixSelectListeners) {
          matrixWrap._matrixSelectListeners = true;
          const invokeMatrixSelectSync = () => matrixWrap._matrixSelectSync?.();
          window.addEventListener('resize', invokeMatrixSelectSync);
          window.addEventListener('scroll', invokeMatrixSelectSync, { passive: true });
        }
        requestAnimationFrame(syncMatrixSelectBar);
      }
      bindCompareSelects();
      document.querySelectorAll('[data-matrix-group-toggle]').forEach(button => {
        button.addEventListener('click', () => {
          const group = button.dataset.matrixGroupToggle;
          const nextCollapsed = button.getAttribute('aria-expanded') === 'true';
          button.setAttribute('aria-expanded', String(!nextCollapsed));
          button.querySelector('.matrix-group-icon').textContent = nextCollapsed ? '▸' : '▾';
          document.querySelectorAll(`[data-matrix-group="${group}"]`).forEach(row => { row.hidden = nextCollapsed; });
          collapsedMatrixGroups[group] = nextCollapsed;
          try { localStorage.setItem('benchmark-dashboard.matrix-groups', JSON.stringify(collapsedMatrixGroups)); } catch (_error) {}
        });
      });
      document.querySelectorAll('[data-matrix-info]').forEach(button => {
        button.addEventListener('click', () => {
          const dialog = document.getElementById('summaryInfoDialog');
          const info = matrixInfoById[button.dataset.matrixInfo];
          if (!dialog) return;
          if (!info) return;
          document.getElementById('summaryInfoTitle').textContent = info.title;
          document.getElementById('summaryInfoText').textContent = info.text;
          dialog.showModal();
        });
      });
    }

    function render() {
      renderMatrix();
    }

    let matrixOrientationRefresh;
    window.addEventListener('orientationchange', () => {
      window.clearTimeout(matrixOrientationRefresh);
      matrixOrientationRefresh = window.setTimeout(() => {
        const details = document.querySelector('.model-details');
        const detailsWereOpen = details?.open === true;
        renderMatrix();
        if (detailsWereOpen) {
          const refreshedDetails = document.querySelector('.model-details');
          if (refreshedDetails) refreshedDetails.open = true;
          refreshedDetails?.closest('tr')?.nextElementSibling?.classList.remove('details-collapsed');
        }
      }, 150);
    });

    restoreComparisonPreferences();
    restoreDashboardDetails();
    reconcileComparisonSelection();
    renderPreselection();
    render();

}
startMk25();
