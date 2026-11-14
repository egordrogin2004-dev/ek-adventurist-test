let playerScores = {}; 
let currentQuestionIndex = 0;
let shuffledQuestions = [];
let playerNickname = "";
let wasHonest = true;
let answersHistory = []; 
let audioCtx = null;

document.addEventListener("DOMContentLoaded", () => {
    renderMeters();
    renderRatingTabs();
    typeWriter(document.getElementById("ui-intro"), UI.ru.intro, 0);
});

function playBeep(freq = 800, duration = 0.05) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

function typeWriter(element, text, i, callback) {
    if (i === 0) element.innerHTML = "";
    if (i < text.length) {
        element.innerHTML += text.charAt(i);
        setTimeout(() => typeWriter(element, text, i + 1, callback), 15);
    } else if (callback) callback();
}

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

function startTest() { playBeep(600); showScreen("screen-honesty"); }
function rejectTest() { playBeep(300); showScreen("screen-reject"); }

function setHonesty(isHonest) {
    playBeep(600);
    wasHonest = isHonest;
    if (!isHonest) {
        document.getElementById("honesty-feedback").innerText = UI.ru.honestNo;
        setTimeout(() => showScreen("screen-nick"), 1500);
    } else {
        showScreen("screen-nick");
    }
}

function validateNick() {
    const input = document.getElementById("nick-input").value.trim().toLowerCase();
    const errorEl = document.getElementById("nick-error");
    const btn = document.getElementById("btn-continue-nick");
    let isReserved = false;
    for (let r of RESERVED) {
        if (r.names.some(n => input === n.toLowerCase() || input.includes(n.toLowerCase()))) {
            errorEl.innerText = r.msg;
            isReserved = true;
            break;
        }
    }
    btn.disabled = isReserved || input.length < 2;
    if (!isReserved) errorEl.innerText = "";
}

function renderMeters() {
    const container = document.querySelector(".meters-container");
    container.innerHTML = "";
    PARAMS.forEach(p => {
        const block = document.createElement("div");
        block.className = "meter-block";
        block.innerHTML = `
            <div class="meter-letter" style="color: ${COLORS[p.key]}">${p.key}</div>
            <div class="meter-track">
                <div class="meter-fill" id="bar-${p.key}" style="background-color: ${COLORS[p.key]}"></div>
            </div>
        `;
        container.appendChild(block);
    });
}

function updateMeters() {
    let isDragging = false;
    PARAMS.forEach(p => {
        let val = playerScores[p.key] || 0;
        let percent = Math.min(100, Math.max(0, (val / 10) * 100));
        let bar = document.getElementById(`bar-${p.key}`);
        bar.style.width = `${percent}%`;

        if (val >= 10) {
            bar.classList.add("shake");
            isDragging = true;
        } else {
            bar.classList.remove("shake");
        }
    });

    const glitchOverlay = document.getElementById("glitch-overlay");
    if (isDragging) glitchOverlay.classList.add("dragin-mode");
    else glitchOverlay.classList.remove("dragin-mode");
}

function startQuestions() {
    playBeep(800);
    playerNickname = document.getElementById("nick-input").value.trim();
    
    const firstQ = QUESTIONS.find(q => q.fixed);
    let rest = QUESTIONS.filter(q => !q.fixed);
    rest = rest.sort(() => Math.random() - 0.5);
    
    shuffledQuestions = [firstQ, ...rest];
    currentQuestionIndex = 0;
    
    playerScores = { D: 2, R: 2, A: 2, G: 2, I: 2, N: 2 }; 
    answersHistory = [];
    
    showScreen("screen-test");
    updateMeters();
    loadQuestion();
}

function loadQuestion() {
    const q = shuffledQuestions[currentQuestionIndex];
    document.getElementById("progress-text").innerText = `СЕКТОР ${currentQuestionIndex + 1} / ${shuffledQuestions.length}`;
    
    const qText = document.getElementById("question-text");
    const scaleContainer = document.getElementById("likert-scale");
    const prevBtn = document.getElementById("btn-prev");
    
    scaleContainer.innerHTML = "";
    qText.innerHTML = "";
    prevBtn.disabled = currentQuestionIndex === 0;

    typeWriter(qText, q.text.ru, 0);

    let prevAnswer = answersHistory[currentQuestionIndex] ? answersHistory[currentQuestionIndex].value : null;

    for (let i = 1; i <= 6; i++) {
        const btn = document.createElement("div");
        btn.className = "likert-option";
        btn.innerText = i;
        if (prevAnswer === i) btn.classList.add("selected");
        btn.onclick = () => answerQuestion(i, q);
        scaleContainer.appendChild(btn);
    }
}

function answerQuestion(value, question) {
    playBeep(400 + (value * 100));
    
    document.querySelectorAll(".likert-option").forEach((el, idx) => {
        el.classList.remove("selected");
        if (idx + 1 === value) el.classList.add("selected");
    });

    if (answersHistory[currentQuestionIndex]) {
        rollbackScore(answersHistory[currentQuestionIndex].question, answersHistory[currentQuestionIndex].value);
    }

    applyScore(question, value);
    answersHistory[currentQuestionIndex] = { value: value, question: question };
    
    updateMeters();

    setTimeout(() => {
        currentQuestionIndex++;
        if (currentQuestionIndex < shuffledQuestions.length) {
            loadQuestion();
        } else {
            finishTest();
        }
    }, 300);
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        playBeep(300);
        currentQuestionIndex--;
        loadQuestion();
    }
}

const SCORE_VALUES = { 1: -1.5, 2: -0.75, 3: 0, 4: 0.5, 5: 0.75, 6: 1.5 };

function applyScore(question, value) {
    let multiplier = SCORE_VALUES[value];
    if (question.inverted) multiplier *= -1;

    for (let key in question.effects) {
        let actualEffect = question.effects[key] * (multiplier / 1.5);
        if (question.fixed) actualEffect = 0.25;

        if (question.caps && question.caps[key]) {
            let capValue = question.caps[key];
            if (actualEffect > capValue) actualEffect = capValue;
            if (actualEffect < -capValue) actualEffect = -capValue;
        }

        playerScores[key] += actualEffect;
        clampScore(key);
    }
}

function rollbackScore(question, value) {
    let multiplier = SCORE_VALUES[value];
    if (question.inverted) multiplier *= -1;

    for (let key in question.effects) {
        let actualEffect = question.effects[key] * (multiplier / 1.5);
        if (question.fixed) actualEffect = 0.25;

        if (question.caps && question.caps[key]) {
            let capValue = question.caps[key];
            if (actualEffect > capValue) actualEffect = capValue;
            if (actualEffect < -capValue) actualEffect = -capValue;
        }
        
        playerScores[key] -= actualEffect;
        clampScore(key);
    }
}

function clampScore(key) {
    if (playerScores[key] < 2) playerScores[key] = 2;
    if (playerScores[key] > 10) playerScores[key] = 10;
}

function finishTest() {
    let finalStats = {};
    for (let key in playerScores) {
        finalStats[key] = Math.floor(playerScores[key]);
    }
    
    let sum = 0;
    for (let key in finalStats) sum += finalStats[key];
    let coef = (sum / 6).toFixed(1);

    const resultData = { name: playerNickname, stats: finalStats, coef: coef, honest: wasHonest };
    localStorage.setItem("ek_adventurer_result", JSON.stringify(resultData));

    // Проверка на скрытую концовку (3+ параметра на 10)
    let maxCount = 0;
    for (let key in finalStats) {
        if (finalStats[key] >= 10) maxCount++;
    }

    if (maxCount >= 3) {
        showSecretEnding();
    } else {
        displayResults(resultData);
        showScreen("screen-results");
        playBeep(1200, 0.2);
    }
}

function showSecretEnding() {
    showScreen("screen-secret");
    const textEl = document.getElementById("secret-text");
    textEl.innerHTML = "";
    
    const lines = [
        "Так ты уже был здесь и обо всем знаешь?",
        "Интересно. Очень интересно.",
        "Возможно, ты — не просто авантюрист.",
        "Возможно, ты — тот, кого мы искали.",
        "Добро пожаловать в Плеяду. По-настоящему."
    ];
    
    let i = 0;
    function typeNext() {
        if (i < lines.length) {
            let p = document.createElement("p");
            p.innerHTML = "";
            textEl.appendChild(p);
            typeWriter(p, lines[i], 0, () => {
                i++;
                setTimeout(typeNext, 800);
            });
        } else {
            let btn = document.createElement("button");
            btn.className = "neon-btn";
            btn.innerText = "Вернуться";
            btn.style.marginTop = "40px";
            btn.onclick = () => location.reload();
            textEl.appendChild(btn);
        }
    }
    typeNext();
}

function displayResults(data) {
    document.getElementById("result-name").innerText = `Имя: ${data.name}`;
    document.getElementById("result-coef").innerText = `Коэффициент авантюриста: ${data.coef}`;
    
    const statsContainer = document.getElementById("result-stats");
    statsContainer.innerHTML = "";
    
    PARAMS.forEach(p => {
        let score = data.stats[p.key];
        let title = p.ru.titles[score] ? p.ru.titles[score].n : "Неизвестно";
        let div = document.createElement("div");
        div.className = "stat-item";
        div.style.borderLeftColor = COLORS[p.key];
        div.innerHTML = `
            <div>
                <span class="stat-name" style="color:${COLORS[p.key]}">${p.key} — ${p.ru.name}</span>
                <span class="stat-title">${title}</span>
            </div>
            <span class="stat-score" style="color:${COLORS[p.key]}">${score} / 10</span>
        `;
        statsContainer.appendChild(div);
    });

    if (!data.honest) document.getElementById("liar-jab").innerText = UI.ru.liarJab;
}

function copyResults() {
    const data = JSON.parse(localStorage.getItem("ek_adventurer_result"));
    let text = `Я прошел отбор в ЕК! Вот мой рейтинг авантюриста!\n`;
    text += `Имя: ${data.name}\n`;
    text += `Коэфф. авантюриста: ${data.coef}\n`;
    PARAMS.forEach(p => {
        let title = p.ru.titles[data.stats[p.key]] ? p.ru.titles[data.stats[p.key]].n : "";
        text += `${p.key} - ${data.stats[p.key]} [${title}]\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        alert("Результаты скопированы!");
        playBeep(1000);
    }).catch(() => alert("Не удалось скопировать."));
}

function renderRatingTabs() {
    const tabs = document.getElementById("rating-tabs");
    tabs.innerHTML = "";
    const totalBtn = document.createElement("button");
    totalBtn.innerText = "Общий";
    totalBtn.onclick = () => { setActiveTab(totalBtn); sortRating(null); };
    totalBtn.classList.add("active");
    tabs.appendChild(totalBtn);

    PARAMS.forEach(p => {
        const btn = document.createElement("button");
        btn.innerText = p.key;
        btn.onclick = () => { setActiveTab(btn); sortRating(p.key); };
        tabs.appendChild(btn);
    });
}

function setActiveTab(activeBtn) {
    document.querySelectorAll("#rating-tabs button").forEach(b => b.classList.remove("active"));
    activeBtn.classList.add("active");
}

function openRating() {
    playBeep(500);
    document.getElementById("modal-rating").classList.add("open");
    sortRating(null);
}

function closeModal(id) { 
    playBeep(300);
    document.getElementById(id).classList.remove("open"); 
}

function sortRating(paramKey) {
    const container = document.getElementById("rating-list");
    container.innerHTML = "";
    
    let playerData = JSON.parse(localStorage.getItem("ek_adventurer_result"));
    let list = CHARACTERS.map(c => {
        let stats = c.stats;
        let sum = Object.values(stats).reduce((x, y) => x + y, 0);
        let coef = (sum / 6).toFixed(1);
        return { ...c, isPlayer: false, coef: coef };
    });

    if (playerData) {
        list.push({
            name: playerData.name,
            stats: playerData.stats,
            coef: playerData.coef,
            desc: "Это ты. Твоя судьба еще не написана.",
            isPlayer: true
        });
    }

    if (paramKey) {
        list.sort((a, b) => b.stats[paramKey] - a.stats[paramKey]);
    } else {
        list.sort((a, b) => parseFloat(b.coef) - parseFloat(a.coef));
    }

    list.forEach((char, index) => {
        let div = document.createElement("div");
        div.className = "rating-row" + (char.isPlayer ? " you" : "");
        div.style.animationDelay = `${index * 0.05}s`;
        
        let statsStr = paramKey 
            ? `${paramKey}: ${char.stats[paramKey]}` 
            : `D:${char.stats.D} R:${char.stats.R} A:${char.stats.A} G:${char.stats.G} I:${char.stats.I} N:${char.stats.N}`;

        let nameHtml = char.isPlayer 
            ? `${char.name} <span style="font-size:0.8em">(ТЫ)</span>` 
            : `<span class="name-clickable" onclick="toggleComment(${index})">${char.name}</span>`;

        div.innerHTML = `
            <div>
                <span class="pos">#${index + 1}</span> ${nameHtml}
                <div class="char-comment" id="comment-${index}">"${char.desc}"</div>
            </div>
            <span>${statsStr} <span style="color:#555; margin-left:10px;">| Коэфф: ${char.coef}</span></span>
        `;
        container.appendChild(div);
    });
}

function toggleComment(index) {
    playBeep(700);
    const comment = document.getElementById(`comment-${index}`);
    if (comment) comment.classList.toggle("show");
}

function openDetails() {
    playBeep(500);
    document.getElementById("modal-details").classList.add("open");
    const container = document.getElementById("details-content");
    let playerData = JSON.parse(localStorage.getItem("ek_adventurer_result"));
    
    let html = "";
    PARAMS.forEach(p => {
        let playerScore = playerData ? playerData.stats[p.key] : null;
        
        html += `<div style="margin-bottom: 30px; border: 1px solid #333; padding: 15px; background: #0a0a0a;">`;
        html += `<h3 style="color: ${COLORS[p.key]}; border-bottom: 1px solid #333; padding-bottom: 5px; margin-bottom: 10px;">${p.key} — ${p.ru.name} (${p.ru.eng})</h3>`;
        html += `<p style="font-style: italic; color: #888; margin-bottom: 15px;">${p.ru.quote}</p>`;
        
        if (playerScore !== null) {
            let title = p.ru.titles[playerScore];
            html += `<div style="background: rgba(255,255,255,0.05); padding: 15px; border-left: 3px solid ${COLORS[p.key]}; margin-bottom: 15px;">`;
            html += `<strong style="color:${COLORS[p.key]}">У ТЕБЯ: ${playerScore} — ${title.n}</strong><br>`;
            html += `<span style="font-size: 0.9em; color: #ccc;">${title.d}</span>`;
            html += `</div>`;
        }
        
        html += `<details><summary style="cursor: pointer; color: var(--text-dim);">Показать все титулы</summary>`;
        p.ru.titles.forEach((t, idx) => {
            let isPlayerTitle = (playerScore === idx) ? `style="color:${COLORS[p.key]}; font-weight:bold;"` : "";
            html += `<p ${isPlayerTitle} style="margin-top: 10px; font-size: 0.9em;"><strong>${idx} — ${t.n}:</strong> <span style="color:#aaa;">${t.d}</span></p>`;
        });
        html += `</details>`;
        html += `</div>`;
    });
    container.innerHTML = html;
}