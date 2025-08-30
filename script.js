document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const fileInput = document.getElementById('fileInput');
    const fileNameSpan = document.getElementById('file-name');
    const translatorCard = document.getElementById('translator-card');
    const subtitleBody = document.getElementById('subtitle-body');
    const saveButton = document.getElementById('saveButton');
    const autoSaveStatus = document.getElementById('autosave-status');

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
                return { index: lines[0], time: lines[1], text: lines.slice(2).join('\n') };
            }
            return null;
        }).filter(Boolean);
    }

    function renderTranslator() {
        subtitleBody.innerHTML = '';
        subtitles.forEach((sub, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="#" class="col-index">${sub.index}</td>
                <td data-label="Timestamp" class="col-time">${sub.time}</td>
                <td data-label="Original Text" class="col-original">${sub.text.replace(/\n/g, '<br>')}</td>
                <td data-label="Translated Text" class="col-translation">
                    <textarea data-id="${i}" class="translation-input" rows="3" spellcheck="false"></textarea>
                    <div class="translation-meta">
                        <button class="copy-original-btn" title="Copy original text">Copy</button>
                        <span class="char-counter">0</span>
                    </div>
                </td>
            `;
            subtitleBody.appendChild(row);
        });
        attachEventListeners();
    }

    function attachEventListeners() {
        document.querySelectorAll('.translation-input').forEach(textarea => {
            textarea.addEventListener('input', handleTextareaInput);
            textarea.addEventListener('keydown', handleTextareaKeyDown);
        });
        document.querySelectorAll('.copy-original-btn').forEach(button => {
            button.addEventListener('click', handleCopyOriginal);
        });
    }

    // --- UX Feature Handlers (from Step 2) ---

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

    // --- Find and Replace Logic (Step 3) ---

    function handleFindNext() {
        const textareas = Array.from(document.querySelectorAll('.translation-input'));
        const searchTerm = findInput.value;

        if (!searchTerm) {
            findReplaceStatus.textContent = "Please enter text to find.";
            return;
        }

        // Reset search if the term changes
        if (searchState.searchTerm !== searchTerm) {
            searchState.currentIndex = -1;
            searchState.searchTerm = searchTerm;
            clearHighlights();
        }
        
        let found = false;
        for (let i = 0; i < textareas.length; i++) {
            // Cycle through textareas starting from the last found index
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
            searchState.currentIndex = -1; // Reset to start from top next time
            clearHighlights();
        }
    }
    
    function handleReplace() {
        if (searchState.currentIndex === -1 || !findInput.value) {
            findReplaceStatus.textContent = "You must find text before you can replace it.";
            return;
        }
        const textarea = document.querySelector(`.translation-input[data-id="${searchState.currentIndex}"]`);
        const findTerm = findInput.value;
        const replaceTerm = replaceInput.value;

        // Using a case-insensitive regex to find the first occurrence to replace
        const regex = new RegExp(findTerm, 'i');
        if (regex.test(textarea.value)) {
            textarea.value = textarea.value.replace(regex, replaceTerm);
            textarea.dispatchEvent(new Event('input', { bubbles: true })); // Trigger autosave & counter
            findReplaceStatus.textContent = "Replaced one occurrence.";
            handleFindNext(); // Automatically find the next one
        }
    }

    function handleReplaceAll() {
        const findTerm = findInput.value;
        const replaceTerm = replaceInput.value;
        if (!findTerm) {
            findReplaceStatus.textContent = "Please enter text to find and replace.";
            return;
        }
        
        const textareas = document.querySelectorAll('.translation-input');
        let totalReplacements = 0;
        const regex = new RegExp(findTerm, 'gi'); // g for global, i for case-insensitive

        textareas.forEach(textarea => {
            const originalValue = textarea.value;
            const newValue = originalValue.replace(regex, replaceTerm);
            if (originalValue !== newValue) {
                totalReplacements += (originalValue.match(regex) || []).length;
                textarea.value = newValue;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        findReplaceStatus.textContent = `Replaced ${totalReplacements} occurrence(s) throughout the file.`;
        clearHighlights();
        searchState.currentIndex = -1;
    }
    
    function clearHighlights() {
        document.querySelectorAll('.translation-input.highlighted').forEach(el => el.classList.remove('highlighted'));
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
            return `${sub.index}\n${sub.time}\n${translatedText}`;
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

        if (confirm("Download started. Would you like to clear the auto-saved data for this file from your browser?")) {
            localStorage.removeItem(getAutoSaveKey());
            autoSaveStatus.textContent = 'Auto-save cleared.';
        }
    }
});
