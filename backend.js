/* Adds AI functionality to the finalized frontend without changing its source file. */
const materialFiles = { paper: [], quiz: [] };
const materialUrls = { paper: [], quiz: [] };
let generationController = null;
let generatedDraftKey = null;
let generationStartedAt = 0;
const generationState = { paper: { phase: 'idle' }, quiz: { phase: 'idle' } };
function byId(id) {
    return document.getElementById(id);
}
const backendStyle = document.createElement('style');
backendStyle.textContent = `.source-files{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:12px;margin-top:14px}.source-file{border:1px solid #ded8eb;border-radius:13px;padding:10px;background:#fff;min-width:0}.source-file img{width:100%;height:100px;object-fit:contain;background:#f6f3fa;border-radius:8px}.source-file strong{display:block;overflow-wrap:anywhere;font-size:12px;color:#302642;margin:8px 0}.source-file button{font-size:12px;padding:6px 10px}.generation-status{color:#463565;background:#f5f0ff;border-radius:12px;padding:12px 14px;line-height:1.6;margin:12px 0;overflow-wrap:anywhere}.generation-status:empty{display:none}.source-ref{color:#504963;font-size:12px}button:disabled{cursor:wait}.preview-sheet p{white-space:pre-wrap}`;
document.head.appendChild(backendStyle);
const previewStyle = document.createElement('style');
previewStyle.textContent = `
    .generation-status { border: 1px solid #ded3f4; color: #392a58; }
    .generation-status[data-phase="error"] { background: #fff2f2; border-color: #e9b8bf; color: #8b2637; }
    .generation-status[data-phase="success"] { background: #edf9f1; border-color: #b9ddc6; color: #185c38; }
    .generation-status[hidden] { display: none; }
    .generation-status-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
    .generation-status-message { flex: 1; min-width: 150px; font-weight: 700; }
    .generation-elapsed { font-size: 12px; color: #54436e; }
    .generation-spinner { display: inline-block; width: 17px; height: 17px; border: 2px solid #b9a9de; border-top-color: #5930b9; border-radius: 50%; animation: generation-spin .8s linear infinite; flex-shrink: 0; }
    #generateButton .generation-spinner { border-color: #ada0c9; border-top-color: #442174; }
    .draft-note { color: #57416e !important; background: #f5f0fc; border-radius: 8px; padding: 10px; }
    .draft-question { color: #5c536b !important; padding: 9px 0; border-bottom: 1px dashed #ded6ea; }
    .draft-summary { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 12px; margin: 10px 0; color: #4e3b68; }
    @keyframes generation-spin { to { transform: rotate(360deg); } }
    @media(prefers-reduced-motion: reduce) { .generation-spinner { animation: none; } }
`;
document.head.appendChild(previewStyle);

function setGenerationStatus(kind, phase, message = '') {
    generationState[kind] = { phase, message };
    const targets = [byId(kind + 'GenerationStatus')];
    if (kind === 'paper') targets.push(byId('paperPreviewStatus'));
    for (const box of targets.filter(Boolean)) {
        box.replaceChildren();
        box.dataset.phase = phase;
        box.hidden = !message;
        if (!message) continue;
        const row = document.createElement('div');
        row.className = 'generation-status-row';
        if (phase === 'busy') {
            const spinner = document.createElement('span');
            spinner.className = 'generation-spinner';
            spinner.setAttribute('aria-hidden', 'true');
            row.append(spinner);
        }
        const label = document.createElement('span');
        label.className = 'generation-status-message';
        label.textContent = message;
        row.append(label);
        if (phase === 'busy') {
            const elapsed = document.createElement('span');
            elapsed.className = 'generation-elapsed';
            elapsed.setAttribute('aria-live', 'off');
            row.append(elapsed);
            if (generationController) {
                const cancel = document.createElement('button');
                cancel.className = 'btn outline';
                cancel.type = 'button';
                cancel.textContent = 'Cancel';
                cancel.onclick = () => generationController?.abort();
                row.append(cancel);
            }
        }
        box.append(row);
    }
    updateGenerationClock();
}

function updateGenerationClock() {
    const seconds = Math.max(0, Math.floor((Date.now() - generationStartedAt) / 1000));
    document.querySelectorAll('.generation-elapsed').forEach((el) => {
        el.textContent =
            seconds < 60
                ? `${seconds}s elapsed`
                : `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed`;
    });
}

function showGenerationError(kind, message) {
    setGenerationStatus(kind, 'error', message);
    toast(message);
}
function initializeUpload(kind, inputId, zoneId) {
    const input = byId(inputId),
        zone = byId(zoneId);
    input.accept = '.pdf,.jpg,.jpeg,.png,.webp';
    input.multiple = true;
    input.onchange = () => {
        addMaterial(kind, [...input.files]);
        input.value = '';
    };
    zone.ondrop = (e) => {
        e.preventDefault();
        zone.classList.remove('drag');
        addMaterial(kind, [...e.dataTransfer.files]);
    };
    const list = document.createElement('div');
    list.className = 'source-files';
    list.id = kind + 'FileList';
    zone.after(list);
    const status = document.createElement('div');
    status.id = kind + 'GenerationStatus';
    status.className = 'generation-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const generateButton =
        kind === 'paper'
            ? byId('generateButton')
            : document.querySelector('#testSetup button[onclick="startTest()"]');
    generateButton.after(status);
    const note = document.createElement('p');
    note.className = 'small';
    note.textContent =
        'Upload one PDF or up to 8 images · 50 MB combined. Material is sent to Gemini when you generate.';
    list.after(note);
    zone.querySelector('p').textContent = 'Click or drop PDF / JPG / PNG / WebP · 50 MB combined';
}
function addMaterial(kind, files) {
    if (generationController) return toast('Wait for generation or cancel before changing files.');
    if (!files.length) return;
    if (files.some((f) => !/^.+\.(pdf|jpe?g|png|webp)$/i.test(f.name)))
        return toast('Choose PDF, JPG, PNG or WebP files.');
    let next = [...materialFiles[kind], ...files];
    // Selecting a new PDF replaces the old material; selecting images after a PDF starts a new set.
    if (files.length === 1 && /\.pdf$/i.test(files[0].name)) next = files;
    else if (materialFiles[kind].some((f) => /\.pdf$/i.test(f.name))) next = files;
    if (next.length > 8 || (next.some((f) => /\.pdf$/i.test(f.name)) && next.length !== 1))
        return toast('Choose one PDF OR up to 8 images.');
    if (next.reduce((s, f) => s + f.size, 0) > 50 * 1024 * 1024)
        return toast('Keep the combined upload size within 50 MB.');
    materialFiles[kind] = next;
    renderMaterial(kind);
}
function removeMaterial(kind, index) {
    if (generationController) return toast('Cancel generation before changing files.');
    materialFiles[kind].splice(index, 1);
    renderMaterial(kind);
}
function renderMaterial(kind) {
    materialUrls[kind].forEach(URL.revokeObjectURL);
    materialUrls[kind] = [];
    const list = byId(kind + 'FileList');
    list.replaceChildren();
    materialFiles[kind].forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'source-file';
        if (!/\.pdf$/i.test(file.name)) {
            const img = document.createElement('img'),
                url = URL.createObjectURL(file);
            materialUrls[kind].push(url);
            img.src = url;
            img.alt = 'Source image ' + (index + 1);
            card.append(img);
        }
        const name = document.createElement('strong');
        name.textContent = index + 1 + '. ' + file.name;
        card.append(name);
        const remove = document.createElement('button');
        remove.className = 'btn outline';
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.onclick = () => removeMaterial(kind, index);
        card.append(remove);
        list.append(card);
    });
    const label = byId(kind === 'paper' ? 'fileLabel' : 'quizFileLabel');
    label.textContent = materialFiles[kind].length
        ? materialFiles[kind].length + ' source file(s) selected · Click to add / replace'
        : 'Upload PDF or study images';
    if (kind === 'paper') updatePreview();
}
initializeUpload('paper', 'pdfFile', 'upload');
initializeUpload('quiz', 'quizPdfFile', 'quizUpload');
const previewStatus = document.createElement('div');
previewStatus.id = 'paperPreviewStatus';
previewStatus.className = 'generation-status';
previewStatus.setAttribute('role', 'status');
previewStatus.setAttribute('aria-live', 'polite');
byId('paperPreview').before(previewStatus);
byId('removeQuizPdf').style.display = 'none';
byId('sourcePdf').querySelector('strong').textContent = 'PDF / images';
byId('sourcePdf').querySelector('small').textContent = 'Questions from your notes';
byId('generateButton').textContent = '✦ Generate Question Paper →';
byId('subject').maxLength = 120;
document.querySelectorAll('.count').forEach((x) => (x.max = 50));
byId('upload').closest('.card').querySelector('.pill').textContent = 'PDF + images';
const studyNote = byId('upload').closest('.card').querySelector('.footer-note');
if (studyNote)
    studyNote.textContent =
        'Use clear notes or screenshots. AI questions must be reviewed before use.';
byId('quizPdfPanel').querySelector('p.small').textContent =
    'Questions are generated from all your uploaded sources together.';
document.querySelector('#page-create .studio-preview .pill').textContent = 'AI Paper';
document.querySelector('#page-create .studio-preview .footer-note').textContent =
    'Generate first, then export the paper or answer key with Save as PDF.';
byId('mcqCount').max = 50;
updateQuizSourceNote = function () {
    const pdf = quizSource === 'pdf';
    byId('topicNote').textContent =
        topicDescriptions[byId('testSubject').value] + ' 10 built-in practice questions available.';
    document.querySelector('#testSetup .footer-note').textContent = pdf
        ? 'AI questions from your uploaded material · Up to 50 questions'
        : 'Built-in topic practice · 1–10 questions';
    document.querySelector('#testSetup button[onclick="startTest()"]').textContent = pdf
        ? '✦ Generate & Start Test'
        : '▶ Start Topic Practice';
};
updateQuizSourceNote();
function paperDraftKey() {
    return JSON.stringify({
        subject: byId('subject').value.trim(),
        marks: byId('marks').value,
        duration: byId('duration').value,
        difficulty: byId('difficulty').value,
        counts: getCounts(),
        files: materialFiles.paper.map((file) => [file.name, file.size, file.lastModified]),
    });
}

function draftPaperMarkup(counts) {
    const subject = byId('subject').value.trim() || 'Your subject';
    const total = counts.reduce((sum, count) => sum + count, 0);
    let markup = `<h3>${escapeHtml(subject.toUpperCase())}</h3>
        <div class="sub">QUESTION PAPER · DRAFT</div>
        <div class="marks">Time: ${escapeHtml(byId('duration').value || '—')} minutes · Marks: ${escapeHtml(byId('marks').value || '—')}</div>
        <div class="draft-summary"><span>${total} question${total === 1 ? '' : 's'}</span><span>${escapeHtml(byId('difficulty').value)}</span></div>
        <p class="draft-note">Live outline · Your questions will appear after generation.</p>`;
    let number = 0,
        section = 0;
    counts.forEach((count, index) => {
        if (!count) return;
        markup += `<h4>SECTION ${String.fromCharCode(65 + section++)} — ${escapeHtml(questionTypes[index][1].toUpperCase())}</h4>`;
        markup += `<p class="small">${count} question${count === 1 ? '' : 's'}</p>`;
        for (let item = 0; item < Math.min(count, 3); item++) {
            markup += `<p class="draft-question"><b>${number + item + 1}.</b> Question will be generated from your material.</p>`;
        }
        if (count > 3)
            markup += `<p class="small">+ ${count - 3} more questions in this section</p>`;
        number += count;
    });
    if (!total) markup += '<p>Choose your question counts to build the paper outline.</p>';
    if (total > 50) markup += '<p class="bad">Choose up to 50 questions per paper.</p>';
    return markup;
}

updatePreview = function () {
    const counts = getCounts();
    byId('totalQuestions').textContent = counts.reduce((a, b) => a + b, 0);
    const generated = !!activePaper && generatedDraftKey === paperDraftKey();
    byId('paperPreview').innerHTML = generated
        ? fullMarkup(activePaper, false)
        : draftPaperMarkup(counts);
    document.querySelector('#page-create .studio-preview .pill').textContent = generated
        ? 'AI Paper'
        : 'Live Draft';
    document.querySelectorAll('#page-create .studio-preview button').forEach((button) => {
        button.disabled = !generated || generationState.paper.phase === 'busy';
    });
    if (!generated && generationState.paper.phase === 'success') {
        setGenerationStatus(
            'paper',
            'idle',
            'Details changed. Generate again to update the questions.',
        );
    }
};
fullMarkup = function (p, answer = false) {
    return `<h3>${escapeHtml(p.subject.toUpperCase())}</h3><div class="sub">${answer ? 'ANSWER KEY' : 'QUESTION PAPER'}</div><div class="marks">Time: ${escapeHtml(p.duration)} minutes · Marks: ${escapeHtml(p.marks)}</div><p class="small" style="text-align:center">AI-generated from uploaded study material · Review before use</p>${p.sections.map((s, i) => `<h4>SECTION ${String.fromCharCode(65 + i)} — ${escapeHtml(s.type.toUpperCase())}</h4>${s.questions.map((q) => `<p><b>${q.number}.</b> ${escapeHtml(q.text)}</p>${answer ? `<p><b>Answer:</b> ${escapeHtml(q.answer)}</p><p class="source-ref">Source: ${escapeHtml(q.source || 'Not recorded')}</p>` : q.options ? `<p>${q.options.map((v, j) => String.fromCharCode(65 + j) + ') ' + escapeHtml(v)).join('\n')}</p>` : ''}`).join('')}`).join('')}`;
};
updatePreview();
document.querySelectorAll('#subject, #duration, #marks, #difficulty, .count').forEach((input) => {
    input.oninput = updatePreview;
    input.onchange = updatePreview;
});
function readBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read ' + file.name));
        reader.onload = () =>
            resolve({ name: file.name, data: String(reader.result).split(',')[1] });
        reader.readAsDataURL(file);
    });
}
async function requestQuestions(kind, counts, subject, difficulty) {
    if (!authUser || !authClient) {
        showLoginPlaceholder();
        throw new Error('Please log in before generating questions.');
    }
    if (!materialFiles[kind].length) throw new Error('Upload a PDF or your study images first.');
    if (generationController) throw new Error('Another generation is in progress.');
    const owner = authUser.id,
        controller = new AbortController();
    generationController = controller;
    generationStartedAt = Date.now();
    setGenerationStatus(kind, 'busy', 'Preparing generation — reading your files…');
    const ticker = setInterval(updateGenerationClock, 1000);
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    try {
        const { data, error } = await authClient.auth.getSession();
        if (error || !data.session) throw new Error('Please log in again.');
        const files = await Promise.all(materialFiles[kind].map(readBase64));
        if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        setGenerationStatus(
            kind,
            'busy',
            kind === 'paper'
                ? 'Generating your question paper… Please keep this page open.'
                : 'Generating your MCQ test… Please keep this page open.',
        );
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + data.session.access_token,
            },
            body: JSON.stringify({ files, counts, subject, difficulty }),
            signal: controller.signal,
        });
        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error('The backend did not respond correctly. Open the app using py app.py.');
        }
        if (!response.ok) throw new Error(result.error || 'Generation failed.');
        if (authUser?.id !== owner) throw new Error('Your account changed. Please generate again.');
        setGenerationStatus(kind, 'success', 'Ready · Generated with ' + result.model);
        return result.sections;
    } catch (error) {
        const message =
            error.name === 'AbortError'
                ? 'Generation cancelled or timed out. Any request already sent to Gemini may still consume quota.'
                : error.message;
        const failure = new Error(message);
        failure.accountChanged = authUser?.id !== owner;
        if (!failure.accountChanged) setGenerationStatus(kind, 'error', message);
        throw failure;
    } finally {
        clearTimeout(timeout);
        clearInterval(ticker);
        if (generationController === controller) generationController = null;
    }
}
generatePaper = async function () {
    if (generationController) return toast('A generation is already in progress.');
    const counts = getCounts(),
        subject = byId('subject').value.trim(),
        marks = Number(byId('marks').value),
        duration = Number(byId('duration').value),
        difficulty = byId('difficulty').value;
    if (!subject) return showGenerationError('paper', 'Enter a subject name.');
    if (
        [...document.querySelectorAll('.count')].some(
            (input) =>
                !Number.isInteger(Number(input.value)) ||
                Number(input.value) < 0 ||
                Number(input.value) > 50,
        )
    ) {
        return showGenerationError('paper', 'Enter whole-number counts from 0 to 50.');
    }
    if (counts.reduce((a, b) => a + b, 0) < 1 || counts.reduce((a, b) => a + b, 0) > 50)
        return showGenerationError('paper', 'Choose 1–50 questions in total.');
    if (
        !Number.isFinite(marks) ||
        marks <= 0 ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 600
    )
        return showGenerationError('paper', 'Enter valid marks and a duration from 1–600 minutes.');
    const button = byId('generateButton');
    const draftKey = paperDraftKey();
    const filename = materialFiles.paper.map((file) => file.name).join(', ');
    const inputs = [...document.querySelectorAll('#page-create input, #page-create select')].map(
        (input) => [input, input.disabled],
    );
    inputs.forEach(([input]) => (input.disabled = true));
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="generation-spinner" aria-hidden="true"></span> Generating…';
    generationStartedAt = Date.now();
    setGenerationStatus('paper', 'busy', 'Preparing your question paper…');
    updatePreview();
    try {
        const sections = await requestQuestions('paper', counts, subject, difficulty);
        activePaper = {
            id: Date.now(),
            subject,
            marks,
            duration,
            difficulty,
            counts,
            sections,
            date: new Date().toISOString(),
            filename,
            source: 'ai',
        };
        generatedDraftKey = draftKey;
        viewingAnswers = false;
        updatePreview();
        await navigate('preview');
        toast('Your question paper is ready. Review it before use.');
    } catch (e) {
        if (!e.accountChanged) showGenerationError('paper', e.message);
    } finally {
        inputs.forEach(([input, disabled]) => (input.disabled = disabled));
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        button.textContent = '✦ Generate Question Paper →';
        updatePreview();
    }
};
const builtInStartTest = startTest;
startTest = async function () {
    if (quizSource !== 'pdf') return builtInStartTest();
    if (generationController) return toast('A generation is already in progress.');
    const n = Number(byId('mcqCount').value),
        per = Number(byId('timePerQuestion').value);
    if (!Number.isInteger(n) || n < 1 || n > 50)
        return showGenerationError('quiz', 'Choose 1–50 MCQs.');
    if (!Number.isFinite(per) || per < 0.25 || per > 30)
        return showGenerationError('quiz', 'Choose 0.25–30 minutes per question.');
    const button = document.querySelector('#testSetup button[onclick="startTest()"]');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="generation-spinner" aria-hidden="true"></span> Generating…';
    generationStartedAt = Date.now();
    setGenerationStatus('quiz', 'busy', 'Preparing your MCQ test…');
    try {
        const sections = await requestQuestions(
            'quiz',
            [n, 0, 0, 0, 0],
            'Uploaded study material',
            'Balanced',
        );
        testQuestions = sections[0].questions.map((q) => ({
            q: q.text,
            o: q.options,
            a: q.options.indexOf(q.answer),
            source: q.source,
        }));
        answers = Array(n).fill(null);
        current = 0;
        remaining = Math.round(n * per * 60);
        testRunning = true;
        runningQuizLabel = 'Study material MCQ test';
        runningQuizSource = 'ai';
        window.testStartedAt = Date.now();
        byId('testSetup').classList.add('hidden');
        byId('testResults').classList.add('hidden');
        byId('testLive').classList.remove('hidden');
        byId('liveSourceNote').textContent =
            'AI questions from ' + materialFiles.quiz.map((f) => f.name).join(', ');
        renderQuestion();
        updateTimer();
        const deadline = Date.now() + remaining * 1000;
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            updateTimer();
            if (remaining === 0) submitTest(true);
        }, 250);
        toast('Your test has started.');
    } catch (e) {
        if (!e.accountChanged) showGenerationError('quiz', e.message);
    } finally {
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        updateQuizSourceNote();
    }
};
// Export only generated/saved content, never the prototype question bank.
downloadPaper = function (answer) {
    if (!activePaper) return toast('Generate a paper first.');
    if (document.querySelector('#page-create.active') && generatedDraftKey !== paperDraftKey()) {
        return toast('Generate your current paper settings before downloading.');
    }
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to export your PDF.');
    w.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(activePaper.subject)} — ${answer ? 'Answer Key' : 'Question Paper'}</title><style>body{font:15px/1.65 Arial,sans-serif;color:#161622;background:#fff;margin:32px}h3,h4,.sub{text-align:center}.marks{text-align:right;border-bottom:1px solid #aaa}p{white-space:pre-wrap;break-inside:avoid}.small,.source-ref{font-size:12px;color:#4b445a}.printbar{padding:16px;background:#f0eaff}button{background:#623ac5;color:white;padding:12px 20px;border:0;border-radius:8px}@media print{@page{size:A4;margin:18mm}body{margin:0}.printbar{display:none}}</style></head><body><div class="printbar"><button onclick="window.print()">Print / Save as PDF</button><p>Choose “Save as PDF” as the destination.</p></div>${fullMarkup(activePaper, answer)}</body></html>`,
    );
    w.document.close();
    w.focus();
};
const renderSavedOriginal = renderPapers;
renderPapers = function () {
    renderSavedOriginal();
    document
        .querySelectorAll('#page-papers .card .small')
        .forEach((x) => (x.textContent = x.textContent.replace('Demo paper', 'Saved paper')));
};
const dashboardOriginal = refreshDashboard;
refreshDashboard = function () {
    dashboardOriginal();
    document.querySelectorAll('#page-dashboard tbody td').forEach((x) => {
        if (x.textContent === 'Demo Paper') x.textContent = 'Saved Paper';
    });
};
const oldSyncAccount = syncAccount;
syncAccount = function (user) {
    const changed = (authUser?.id || null) !== (user?.id || null);
    if (changed) {
        generationController?.abort();
        generatedDraftKey = null;
        for (const kind of ['paper', 'quiz']) {
            setGenerationStatus(kind, 'idle');
            materialFiles[kind] = [];
            renderMaterial(kind);
        }
    }
    oldSyncAccount(user);
};
const pdfHint = document.querySelector('#page-preview .mini-card p');
if (pdfHint)
    pdfHint.textContent = 'Upload your study material in Online Test to generate a timed MCQ test.';
fetch('/api/status')
    .then((r) => r.json())
    .then((s) => {
        if (!s.configured && generationState.paper.phase === 'idle' && !generationController)
            setGenerationStatus(
                'paper',
                'error',
                'Add GEMINI_API_KEY to .env beside app.py, then restart the server.',
            );
    })
    .catch(() => {
        if (!generationController)
            setGenerationStatus(
                'paper',
                'error',
                'Backend is unavailable. Start it with py app.py.',
            );
    });
// Refresh explanatory copy while retaining the finalized layout and animations.
const copyUpdates = new Map([
    [
        'Explore sample papers and your current prototype preview.',
        'Review papers generated from your study material.',
    ],
    [
        'Papers saved in this browser. Demo questions only.',
        'Saved on this browser for your account. Cloud sync is not connected yet.',
    ],
    [
        'Based on your completed practice tests in this browser. Topic practice and sample PDF previews are labeled in Test History.',
        'Based on your completed AI and topic practice tests on this browser.',
    ],
    [
        'Demo test attempts stay in this browser. No account is needed.',
        'Test attempts stay in this browser. Sign in to generate questions from your material.',
    ],
    [
        'Review the paper and answer key separately. Save the sample paper or export each with your browser.',
        'Review the paper and answer key separately. Save the paper or export each with your browser.',
    ],
    [
        'Take a timed demo quiz, move between questions, and see correct, incorrect and skipped answers.',
        'Take a timed MCQ test, move between questions, and review correct, incorrect and skipped answers.',
    ],
    [
        'This version demonstrates the frontend only. PDF selection works, but the file is not parsed or sent anywhere. Questions are clearly labeled samples.',
        'Upload one PDF or up to 8 study images. Gemini generates questions from your material. Review the output for accuracy. Topic practice uses built-in questions; cloud history sync is not connected yet.',
    ],
]);
const copyWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (copyWalker.nextNode()) {
    const node = copyWalker.currentNode;
    // HTML formatting may wrap one sentence over multiple indented lines.
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (copyUpdates.has(text)) node.textContent = copyUpdates.get(text);
}
