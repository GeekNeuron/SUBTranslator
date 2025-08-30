document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const fileInput = document.getElementById('fileInput');
    const fileNameSpan = document.getElementById('file-name');
    const translatorCard = document.getElementById('translator-card');
    const subtitleBody = document.getElementById('subtitle-body');
    const saveButton = document.getElementById('saveButton');
    const autoSaveStatus = document.getElementById('autosave-status');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const addLineBtn = document.getElementById('add-line-btn');
    const deleteLinesBtn = document.getElementById('delete-lines-btn');

    // Find and Replace Elements
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');
    const findNextBtn = document.getElementById('find-next-btn');
    const replaceBtn = document.getElementById('replace-btn');
    const replaceAllBtn = document.getElementById('replace-all-btn');
    const findReplaceStatus = document.getElementById('find-replace-status');

    let subtitles = [];
    let originalFileName = 'translated.srt';
    let currentFileContent = '';

    // State for Find and Replace
    let searchState = {
        currentIndex: -1,
        searchTerm: ''
    };
    
    const CHAR_LIMIT_PER_LINE = 42;

    // --- Main Event Listeners ---
    fileInput.addEventListener('change', handleFileSelect);
    saveButton.addEventListener('click', saveTranslatedFile);
    findNextBtn.addEventListener('click', handleFindNext);
    replaceBtn.addEventListener('click', handleReplace);
    replaceAllBtn.addEventListener('click', handleReplaceAll);
    selectAllCheckbox.addEventListener('change', handleSelectAll);
    addLineBtn.addEventListener('click', handleAddLine);
    deleteLinesBtn.addEventListener('click', handleDeleteLines);

    // --- Core Functions ---

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file || !file.name.endsWith('.srt')) {
            alert('Please select a valid .srt file.');
            return;
        }
        originalFileName = file.name.replace('.srt', '_translated.srt');
        fileNameSpan.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            currentFileContent = e.target.result;
            subtitles = parseSrt(currentFileContent);
            if (subtitles.length > 0) {
                renderTranslator();
                loadAutoSavedTranslations();
                translatorCard.classList.remove('hidden');
            } else {
                alert('The subtitle file appears to be empty or invalid.');
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    function parseSrt(data) {
        return data.trim().replace(/\r/g, '').split('\n\n').map(block => {
            const lines = block.split('\n');
            if (lines.length >= 2 && lines[1].includes('-->')) {
                const timeParts = lines[1].split(' --> ');
                return {
                    index: parseInt(lines[0], 10),
                    startTime: timeParts[0],
                    endTime: timeParts[1],
                    text: lines.slice(2).join('\n'),
                    selected: false
                };
            }
            return null;
        }).filter(Boolean);
    }

    function renderTranslator() {
        subtitleBody.innerHTML = '';
        subtitles.forEach((sub, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Select" class="col-select"><input type="checkbox" class="line-checkbox" data-index="${i}" ${sub.selected ? 'checked' : ''}></td>
                <td data-label="#" class="col-index">${sub.index}</td>
                <td data-label="Timestamp" class="col-time">${sub.startTime} --> ${sub.endTime}</td>
                <td data-label="Original Text" class="col-original">${sub.text.replace(/\n/g, '<br>')}</td>
                <td data-label="Translated Text" class="col-translation">
                    <textarea data-id="${i}" class="translation-input" rows="2" spellcheck="false"></textarea>
                    <div class="translation-meta">
                        <button class="copy-original-btn" title="Copy original text">Copy</button>
                        <span class="char-counter">0</span>
                    </div>
                </td>
            `;
            subtitleBody.appendChild(row);
        });
        attachEventListeners();
        updateSelectAllCheckboxState();
    }

    function attachEventListeners() {
        document.querySelectorAll('.line-checkbox').forEach(cb => cb.addEventListener('change', handleLineSelect));
        document.querySelectorAll('.translation-input').forEach(textarea => {
            textarea.addEventListener('input', handleTextareaInput);
            textarea.addEventListener('keydown', handleTextareaKeyDown);
        });
        document.querySelectorAll('.copy-original-btn').forEach(button => {
            button.addEventListener('click', handleCopyOriginal);
        });
    }

    // --- Add/Delete/Selection Logic ---

    function handleAddLine() {
        const selectedIndex = subtitles.findIndex(sub => sub.selected);
        if (selectedIndex === -1) {
            alert("Please select a line. The new line will be inserted before it.");
            return;
        }
        if (selectedIndex === 0) {
            alert("Cannot add a line before the first subtitle.");
            return;
        }
        const prevSub = subtitles[selectedIndex - 1];
        const nextSub = subtitles[selectedIndex];
        const prevEndTime = timeToMilliseconds(prevSub.endTime);
        const nextStartTime = timeToMilliseconds(nextSub.startTime);
        const gap = nextStartTime - prevEndTime;
        if (gap < 200) { // Minimum 200ms gap required
            alert(`Not enough time (${gap}ms) between lines ${prevSub.index} and ${nextSub.index} to add a new line.`);
            return;
        }
        const newSubtitle = {
            index: -1,
            startTime: millisecondsToTime(prevEndTime + 1),
            endTime: millisecondsToTime(nextStartTime - 1),
            text: "[New Line]",
            selected: false,
        };
        subtitles.splice(selectedIndex, 0, newSubtitle);
        reindexSubtitles();
        renderTranslator();
        loadAutoSavedTranslations();
    }

    function handleDeleteLines() {
        const selectedCount = subtitles.filter(sub => sub.selected).length;
        if (selectedCount === 0) {
            alert("Please select one or more lines to delete.");
            return;
        }
        if (confirm(`Are you sure you want to delete ${selectedCount} selected line(s)? This cannot be undone.`)) {
            subtitles = subtitles.filter(sub => !sub.selected);
            reindexSubtitles();
            renderTranslator();
            loadAutoSavedTranslations();
        }
    }

    function reindexSubtitles() {
        subtitles.forEach((sub, i) => {
            sub.index = i + 1;
        });
    }

    function handleLineSelect(event) {
        const index = parseInt(event.target.dataset.index, 10);
        subtitles[index].selected = event.target.checked;
        updateSelectAllCheckboxState();
    }

    function handleSelectAll(event) {
        const isChecked = event.target.checked;
        subtitles.forEach(sub => sub.selected = isChecked);
        document.querySelectorAll('.line-checkbox').forEach(cb => cb.checked = isChecked);
    }

    function updateSelectAllCheckboxState() {
        const selectedCount = subtitles.filter(sub => sub.selected).length;
        if (subtitles.length > 0) {
            selectAllCheckbox.checked = selectedCount === subtitles.length;
            selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < subtitles.length;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }

    // --- Find and Replace Logic ---

    function handleFindNext() {
        const textareas = Array.from(document.querySelectorAll('.translation-input'));
        const searchTerm = findInput.value;
        if (!searchTerm) {
            findReplaceStatus.textContent = "Please enter text to find.";
            return;
        }
        if (searchState.searchTerm !== searchTerm) {
            searchState.currentIndex = -1;
            searchState.searchTerm = searchTerm;
            clearHighlights();
        }
        let found = false;
        for (let i = 0; i < textareas.length; i++) {
            let currentIndex = (searchState.currentIndex + 1 + i) % textareas.length;
            const textarea = textareas[currentIndex];
            if (textarea.value.toLowerCase().includes(searchTerm.toLowerCase())) {
                clearHighlights();
                textarea.classList.add('highlighted');
                textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                findReplaceStatus.textContent = `Found in line #${subtitles[currentIndex].index}`;
                searchState.currentIndex = currentIndex;
                found = true;
                break;
            }
        }
        if (!found) {
            findReplaceStatus.textContent = "End of document reached. No more results.";
            searchState.currentIndex = -1;
            clearHighlights();
        }
    }

    function handleReplace() {
        if (searchState.currentIndex === -1 || !findInput.value) {
            findReplaceStatus.textContent = "You must find text before you can replace it.";
            return;
        }
        const textarea = document.querySelector(`.translation-input[data-id="${searchState.currentIndex}"]`);
        const regex = new RegExp(findInput.value, 'i');
        if (regex.test(textarea.value)) {
            textarea.value = textarea.value.replace(regex, replaceInput.value);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            findReplaceStatus.textContent = "Replaced one occurrence.";
            handleFindNext();
        }
    }

    function handleReplaceAll() {
        const findTerm = findInput.value;
        const replaceTerm = replaceInput.value;
        if (!findTerm) {
            findReplaceStatus.textContent = "Please enter text to find and replace.";
            return;
        }
        let totalReplacements = 0;
        const regex = new RegExp(findTerm, 'gi');
        document.querySelectorAll('.translation-input').forEach(textarea => {
            const originalValue = textarea.value;
            const newValue = originalValue.replace(regex, replaceTerm);
            if (originalValue !== newValue) {
                totalReplacements += (originalValue.match(regex) || []).length;
                textarea.value = newValue;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        findReplaceStatus.textContent = `Replaced ${totalReplacements} occurrence(s).`;
        clearHighlights();
        searchState.currentIndex = -1;
    }

    function clearHighlights() {
        document.querySelectorAll('.translation-input.highlighted').forEach(el => el.classList.remove('highlighted'));
    }

    // --- UX Feature Handlers ---

    function handleTextareaInput(event) {
        const textarea = event.target;
        const charCounter = textarea.nextElementSibling.querySelector('.char-counter');
        const textLength = textarea.value.length;
        charCounter.textContent = textLength;
        charCounter.classList.toggle('limit-exceeded', textarea.value.split('\n').some(line => line.length > CHAR_LIMIT_PER_LINE));
        autoSaveTranslation(textarea.getAttribute('data-id'), textarea.value);
    }

    function handleCopyOriginal(event) {
        const textarea = event.target.closest('.col-translation').querySelector('textarea');
        const originalText = subtitles[textarea.getAttribute('data-id')].text;
        textarea.value = originalText;
        textarea.focus();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function handleTextareaKeyDown(event) {
        if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            const nextTextarea = document.querySelector(`.translation-input[data-id="${parseInt(event.target.getAttribute('data-id')) + 1}"]`);
            if (nextTextarea) nextTextarea.focus();
            else saveButton.focus();
        }
    }

    // --- Auto-Save & File Download Logic ---

    function getAutoSaveKey() {
        let hash = 0;
        for (let i = 0; i < currentFileContent.length; i++) {
            hash = ((hash << 5) - hash) + currentFileContent.charCodeAt(i);
            hash |= 0;
        }
        return `srt-translation-${hash}`;
    }

    function autoSaveTranslation(index, text) {
        const key = getAutoSaveKey();
        try {
            let translations = JSON.parse(localStorage.getItem(key)) || {};
            translations[index] = text;
            localStorage.setItem(key, JSON.stringify(translations));
            autoSaveStatus.textContent = 'Saved.';
            setTimeout(() => autoSaveStatus.textContent = '', 2000);
        } catch (e) {
            console.error("Failed to save to localStorage", e);
            autoSaveStatus.textContent = 'Save Error!';
        }
    }

    function loadAutoSavedTranslations() {
        const key = getAutoSaveKey();
        const savedTranslations = JSON.parse(localStorage.getItem(key));
        if (savedTranslations) {
            document.querySelectorAll('.translation-input').forEach(textarea => {
                const index = textarea.getAttribute('data-id');
                if (savedTranslations[index]) {
                    textarea.value = savedTranslations[index];
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            autoSaveStatus.textContent = 'Loaded auto-saved session.';
        }
    }

    function saveTranslatedFile() {
        const newSrtContent = subtitles.map((sub, i) => {
            const textarea = document.querySelector(`.translation-input[data-id="${i}"]`);
            const translatedText = textarea.value.trim() || sub.text;
            return `${sub.index}\n${sub.startTime} --> ${sub.endTime}\n${translatedText}`;
        }).join('\n\n') + '\n\n';

        const blob = new Blob([newSrtContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = originalFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (confirm("Download started. Would you like to clear the auto-saved data?")) {
            localStorage.removeItem(getAutoSaveKey());
            autoSaveStatus.textContent = 'Auto-save cleared.';
        }
    }

    // --- Time Conversion Helpers ---
    
    function timeToMilliseconds(timeStr) {
        const parts = timeStr.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
        if (!parts) return 0;
        return parseInt(parts[1]) * 3600000 + parseInt(parts[2]) * 60000 + parseInt(parts[3]) * 1000 + parseInt(parts[4]);
    }

    function millisecondsToTime(ms) {
        if (ms < 0) ms = 0;
        const h = Math.floor(ms / 3600000); ms %= 3600000;
        const m = Math.floor(ms / 60000); ms %= 60000;
        const s = Math.floor(ms / 1000);
        const msec = ms % 1000;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msec).padStart(3, '0')}`;
    }
});
