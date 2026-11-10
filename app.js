// Глобальные переменные
let playerScores = {}; 
let currentQuestionIndex = 0;
let shuffledQuestions = [];
let playerNickname = "";
let wasHonest = true;
let answersHistory = []; // Теперь хранит объекты { value, question }

// --- Инициализация ---
document.addEventListener("DOMContentLoaded", () => {
    renderMeters();
    renderRatingTabs();
    typeWriter(document.getElementById("ui-intro"), UI.ru.intro, 0);
});

// --- Логика баллов (Ужесточена) ---
// Базовые баллы 2.0. Каждый ответ дает от -1.5 до +2.0.
const SCORE_VALUES = { 
    1: -1.5, // Категорически нет (сильный штраф)
    2: -1.0, // Нет
    3: -0.5, // Скорее нет (легкий штраф)
    4: 0.5,  // Скорее да (небольшой плюс)
    5: 1.0,  // Да
    6: 2.0   // Абсолютно да
};

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

function startTest() { showScreen("screen-honesty"); }
function rejectTest() { showScreen("screen-reject"); }

function setHonesty(isHonest) {
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
    PARAMS.forEach(p => {
        let val = playerScores[p.key] || 0;
        let percent = Math.min(100, Math.max(0, (val / 10) * 100));
        document.getElementById(`bar-${p.key}`).style.width = `${percent}%`;
    });
}

function startQuestions() {
    playerNickname = document.getElementById("nick-input").value.trim();
    
    const firstQ = QUESTIONS.find(q => q.fixed);
    let rest = QUESTIONS.filter(q => !q.fixed);
    rest = rest.sort(() => Math.random() - 0.5);
    
    shuffledQuestions = [firstQ, ...rest];
    currentQuestionIndex = 0;
    
    // Стартуем с 2 баллов (чтобы не было нуля)
    playerScores = { D: 2, R: 2, A: 2, G: 2, I: 2, N: 2 }; 
    answersHistory = [];
    
    showScreen("screen-test");
    updateMeters(); // Сброс шкал на старт
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

    // Восстановление выбора, если возвращались назад
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
    document.querySelectorAll(".likert-option").forEach((el, idx) => {
        el.classList.remove("selected");
        if (idx + 1 === value) el.classList.add("selected");
    });

    // Если игрок меняет ответ на этот же вопрос — откатываем старый
    if (answersHistory[currentQuestionIndex]) {
        rollbackScore(answersHistory[currentQuestionIndex].question, answersHistory[currentQuestionIndex].value);
    }

    // Применяем новый
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
    }, 400);
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        // loadQuestion сам восстановит выбранный кружок из answersHistory
        loadQuestion();
    }
}

// --- Математика ---
function applyScore(question, value) {
    let multiplier = SCORE_VALUES[value];
    if (question.inverted) multiplier *= -1;

    for (let key in question.effects) {
        let effect = question.effects[key] * multiplier;
        
        // Первый вопрос всегда дает фикс +0.5 всем (и не более)
        if (question.fixed) effect = 0.5;

        playerScores[key] += effect;
        clampScore(key);
    }
}

function rollbackScore(question, value) {
    let multiplier = SCORE_VALUES[value];
    if (question.inverted) multiplier *= -1;

    for (let key in question.effects) {
        let effect = question.effects[key] * multiplier;
        if (question.fixed) effect = 0.5;
        
        playerScores[key] -= effect;
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

    displayResults(resultData);
    showScreen("screen-results");
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
    }).catch(() => alert("Не удалось скопировать."));
}

// --- РЕЙТИНГ (С коэффициентом и позицией игрока) ---
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
    document.getElementById("modal-rating").classList.add("open");
    sortRating(null);
}

function closeModal(id) { document.getElementById(id).classList.remove("open"); }

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
            desc: { ru: "Это ты." },
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
        
        let statsStr = paramKey 
            ? `${paramKey}: ${char.stats[paramKey]}` 
            : `D:${char.stats.D} R:${char.stats.R} A:${char.stats.A} G:${char.stats.G} I:${char.stats.I} N:${char.stats.N}`;

        let nameStr = char.isPlayer ? `${char.name} <span style="font-size:0.8em">(ТЫ)</span>` : char.name;
        
        // Выводим и статы, и коэффициент
        div.innerHTML = `<span><span class="pos">#${index + 1}</span> ${nameStr}</span> <span>${statsStr} <span style="color:#555; margin-left:10px;">| Коэфф: ${char.coef}</span></span>`;
        container.appendChild(div);
    });
}

function openDetails() {
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