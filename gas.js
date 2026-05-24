// ═══════════════════════════════════════════════════════════════
// 21일 글쓰기 챌린지 — Google Apps Script
// 이 파일 전체를 구글 앱스스크립트에 붙여넣고 배포하세요.
// ═══════════════════════════════════════════════════════════════

const SHEET_NAMES = {
  participants: '참가자',
  submissions:  '제출',
  hof:          '명예의전당',
  config:       '설정',
  reports:      '기수리포트',
};

// ── 헤더 정의 ──────────────────────────────────────────────────
const HEADERS = {
  participants: ['nickname','blogUrl','startLevel','registeredAt'],
  submissions:  ['nickname','level','postTitle','postLink','todayComments',
                 'dailyViews','inquiry','revenue','revenueAmt','memo','submittedAt'],
  hof:          ['name','review','storyUrl','blogUrl','totalViews','inquiry','imgUrl','addedAt'],
  config:       ['key','value'],
  reports:      ['nickname','cohort','finalLevel','reportType',
                 'totalPosts','totalViews','maxVisitors','inquiryCount','totalRevenue',
                 'whatTried','whatResults','whatNext',
                 'hypothesis','actualResults','rootCause','submittedAt'],
};

// ── 시트 가져오기 (없으면 생성) ────────────────────────────────
function getSheet(key) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const name = SHEET_NAMES[key];
  let sheet  = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(HEADERS[key]);
    sheet.getRange(1, 1, 1, HEADERS[key].length)
         .setFontWeight('bold')
         .setBackground('#2d2d2d')
         .setFontColor('#ffffff');
  }
  return sheet;
}

// ── 시트 데이터 → 객체 배열 변환 ──────────────────────────────
function sheetToObjects(key) {
  const sheet  = getSheet(key);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return []; // 헤더만 있는 경우
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
}

// ── 객체 → 시트 행 추가 ────────────────────────────────────────
function appendRow(key, obj) {
  const sheet = getSheet(key);
  const row   = HEADERS[key].map(h => obj[h] || '');
  sheet.appendRow(row);
}

// ── 기존 행 업데이트 (nickname 또는 name 기준) ─────────────────
function upsertRow(key, obj, idField) {
  const sheet  = getSheet(key);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    appendRow(key, obj);
    return;
  }
  const headers = values[0];
  const idIdx   = headers.indexOf(idField);
  for (let i = 1; i < values.length; i++) {
    if (values[i][idIdx] === obj[idField]) {
      const row = HEADERS[key].map(h => obj[h] !== undefined ? obj[h] : values[i][headers.indexOf(h)]);
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }
  appendRow(key, obj);
}

// ── 행 삭제 ────────────────────────────────────────────────────
function deleteRow(key, idField, idValue) {
  const sheet  = getSheet(key);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;
  const headers = values[0];
  const idIdx   = headers.indexOf(idField);
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][idIdx]) === String(idValue)) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ── 설정 시트 → 키-값 맵 ──────────────────────────────────────
function getConfigMap() {
  const sheet  = getSheet('config');
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return {};
  const map = {};
  values.slice(1).forEach(row => { if (row[0]) map[String(row[0])] = String(row[1] || ''); });
  return map;
}

// ── CORS 헤더 설정 ──────────────────────────────────────────────
function corsOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET 요청 처리 (대시보드 데이터 읽기) ──────────────────────
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'getAll';

    if (action === 'getAll') {
      return corsOutput({
        status:       'ok',
        spreadsheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
        participants: sheetToObjects('participants'),
        submissions:  sheetToObjects('submissions'),
        hof:          sheetToObjects('hof'),
        config:       getConfigMap(),
      });
    }

    if (action === 'getParticipants') {
      return corsOutput({ status: 'ok', data: sheetToObjects('participants') });
    }

    if (action === 'getSubmissions') {
      return corsOutput({ status: 'ok', data: sheetToObjects('submissions') });
    }

    if (action === 'getHof') {
      return corsOutput({ status: 'ok', data: sheetToObjects('hof') });
    }

    return corsOutput({ status: 'error', message: '알 수 없는 action: ' + action });

  } catch(err) {
    return corsOutput({ status: 'error', message: err.toString() });
  }
}

// ── POST 요청 처리 (데이터 저장) ──────────────────────────────
// 주의: JSON body 대신 form-urlencoded 방식 사용 (CORS 우회)
// fetch 호출 시: body: new URLSearchParams({action, data: JSON.stringify(obj)})
function doPost(e) {
  try {
    const action = e.parameter.action;
    const data   = e.parameter.data ? JSON.parse(e.parameter.data) : {};

    if (action === 'saveParticipant') {
      // 참가 코드 서버 검증 (config 시트에서 읽음, 없으면 기본값 '0000')
      const cfg = getConfigMap();
      const validCode = cfg.accessCode || '0000';
      if (data.accessCode !== validCode) {
        return corsOutput({ status: 'error', message: '참가 코드가 올바르지 않습니다.' });
      }
      upsertRow('participants', data, 'nickname');
      return corsOutput({ status: 'ok' });
    }

    if (action === 'saveSubmission') {
      // 하루 여러 건 허용 — 무조건 추가
      appendRow('submissions', data);
      return corsOutput({ status: 'ok' });
    }

    if (action === 'saveHof') {
      const hofData = {
        name:       data.name       || '',
        review:     data.review     || '',
        storyUrl:   data.storyUrl   || '',
        blogUrl:    data.blogUrl    || '',
        totalViews: data.totalViews || '',
        inquiry:    data.inquiry    || 'X',
        imgUrl:     data.imgUrl     || '',
        addedAt:    data.addedAt    || new Date().toISOString(),
      };
      upsertRow('hof', hofData, 'name');
      return corsOutput({ status: 'ok' });
    }

    if (action === 'deleteHof') {
      deleteRow('hof', 'name', data.name);
      return corsOutput({ status: 'ok' });
    }

    if (action === 'deleteSubmission') {
      // data.submittedAt 기준으로 정확히 일치하는 행 삭제
      const sheet  = getSheet('submissions');
      const values = sheet.getDataRange().getValues();
      if (values.length > 1) {
        const headers = values[0];
        const nickIdx = headers.indexOf('nickname');
        const atIdx   = headers.indexOf('submittedAt');
        const targetMs = new Date(data.submittedAt).getTime();
        for (let i = values.length - 1; i >= 1; i--) {
          try {
            const rowAt = values[i][atIdx];
            const rowMs = ((rowAt instanceof Date) ? rowAt : new Date(rowAt)).getTime();
            if (String(values[i][nickIdx]) === String(data.nickname) && Math.abs(rowMs - targetMs) < 1000) {
              sheet.deleteRow(i + 1);
              break;
            }
          } catch(e) {}
        }
      }
      return corsOutput({ status: 'ok' });
    }

    if (action === 'updateSubmission') {
      // data: { nickname, submittedAt, postTitle, postLink }
      const sheet  = getSheet('submissions');
      const values = sheet.getDataRange().getValues();
      if (values.length > 1) {
        const headers  = values[0];
        const nickIdx  = headers.indexOf('nickname');
        const atIdx    = headers.indexOf('submittedAt');
        const titleIdx = headers.indexOf('postTitle');
        const linkIdx  = headers.indexOf('postLink');
        const targetMs = new Date(data.submittedAt).getTime();
        for (let i = 1; i < values.length; i++) {
          try {
            const rowAt = values[i][atIdx];
            const rowMs = ((rowAt instanceof Date) ? rowAt : new Date(rowAt)).getTime();
            if (String(values[i][nickIdx]) === String(data.nickname) && Math.abs(rowMs - targetMs) < 1000) {
              if (data.postTitle !== undefined) sheet.getRange(i+1, titleIdx+1).setValue(data.postTitle);
              if (data.postLink  !== undefined) sheet.getRange(i+1, linkIdx+1).setValue(data.postLink);
              return corsOutput({ status: 'ok' });
            }
          } catch(e) {}
        }
      }
      return corsOutput({ status: 'error', message: '해당 제출 기록을 찾을 수 없습니다.' });
    }

    if (action === 'deleteParticipant') {
      deleteRow('participants', 'nickname', data.nickname);
      return corsOutput({ status: 'ok' });
    }

    if (action === 'saveReport') {
      const entry = { ...data, submittedAt: data.submittedAt || new Date().toISOString() };
      appendRow('reports', entry);
      return corsOutput({ status: 'ok' });
    }

    if (action === 'saveConfig') {
      Object.entries(data).forEach(([key, value]) => {
        upsertRow('config', { key, value: String(value) }, 'key');
      });
      return corsOutput({ status: 'ok' });
    }

    if (action === 'testTelegram') {
      const cfg    = getConfigMap();
      const token  = data.token  || cfg.telegramToken;
      const chatId = data.chatId || cfg.telegramChatId;
      if (!token || !chatId) {
        return corsOutput({ status: 'error', message: '봇 토큰 또는 채팅 ID가 설정되지 않았습니다.' });
      }
      const msg = '✅ 21일 글쓰기 텔레그램 연동 테스트\n\n설정이 완료되었습니다!\n매일 오전 5시에 전날 제출 현황이 전송됩니다.';
      sendTelegram(token, chatId, msg);
      return corsOutput({ status: 'ok' });
    }

    return corsOutput({ status: 'error', message: '알 수 없는 action: ' + action });

  } catch(err) {
    return corsOutput({ status: 'error', message: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════
// 텔레그램 알림
// ═══════════════════════════════════════════════════════════════

// ── KST 날짜 유틸 (UTC+4 오프셋 = 새벽5시 기준 경계) ───────────
function toKSTDateGAS(date) {
  return new Date(date.getTime() + 4 * 3600000).toISOString().slice(0, 10);
}

function getYesterdayKST() {
  return toKSTDateGAS(new Date(Date.now() - 86400000));
}

function getDayBeforeYestKST() {
  return toKSTDateGAS(new Date(Date.now() - 2 * 86400000));
}

// HTML 특수문자 이스케이프 (<, >, & → 엔티티)
function escHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 'YYYY-MM-DD' → '2026. 05. 23. 토요일'
function formatKoreanDate(dateStr) {
  var parts    = dateStr.split('-').map(Number);
  var year     = parts[0], month = parts[1], day = parts[2];
  var weekdays = ['일','월','화','수','목','금','토'];
  var dow      = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return year + '. ' + String(month).padStart(2,'0') + '. ' + String(day).padStart(2,'0') + '. ' + dow + '요일';
}

// ── 텔레그램 메시지 전송 ──────────────────────────────────────────
function sendTelegram(token, chatId, text) {
  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

// ── 일일 리포트 (트리거로 자동 실행) ─────────────────────────────
function dailyReport() {
  var cfg    = getConfigMap();
  var token  = cfg.telegramToken;
  var chatId = cfg.telegramChatId;
  if (!token || !chatId) return;

  var yesterday     = getYesterdayKST();
  var dayBeforeYest = getDayBeforeYestKST();

  // Day 번호 / 남은 일수 계산
  var dayNum   = '?';
  var daysLeft = '?';
  if (cfg.startDate) {
    var sp        = cfg.startDate.split('-').map(Number);
    var startUTC  = Date.UTC(sp[0], sp[1]-1, sp[2]);
    var yp        = yesterday.split('-').map(Number);
    var yesterUTC = Date.UTC(yp[0], yp[1]-1, yp[2]);
    var totalDays = Number(cfg.totalDays) || 21;
    dayNum   = Math.max(1, Math.floor((yesterUTC - startUTC) / 86400000) + 1);
    daysLeft = Math.max(0, totalDays - dayNum);
  }

  var participants = sheetToObjects('participants');
  var submissions  = sheetToObjects('submissions');

  // 어제 제출 — 닉네임당 마지막 제출만
  var lastSubByNick = {};
  for (var i = 0; i < submissions.length; i++) {
    var s = submissions[i];
    if (!s.submittedAt) continue;
    var d = s.submittedAt instanceof Date ? s.submittedAt : new Date(s.submittedAt);
    if (toKSTDateGAS(d) === yesterday) lastSubByNick[s.nickname] = s;
  }

  // 그제 제출 수 → 댓글 기준
  var dayBeforeCount = 0;
  for (var j = 0; j < submissions.length; j++) {
    var sub = submissions[j];
    if (!sub.submittedAt) continue;
    var dd = sub.submittedAt instanceof Date ? sub.submittedAt : new Date(sub.submittedAt);
    if (toKSTDateGAS(dd) === dayBeforeYest) dayBeforeCount++;
  }
  var commentThreshold = Math.max(0, dayBeforeCount - 1);

  // 어제 제출자 — 제출 시간순 정렬
  var yesterdaySubs = Object.values(lastSubByNick).sort(function(a, b) {
    var da = a.submittedAt instanceof Date ? a.submittedAt : new Date(a.submittedAt);
    var db = b.submittedAt instanceof Date ? b.submittedAt : new Date(b.submittedAt);
    return da - db;
  });

  // 댓글 완료 / 미완 분류
  var commentDone = yesterdaySubs.filter(function(s) {
    return Number(s.todayComments) >= commentThreshold;
  });
  var commentMiss = yesterdaySubs
    .filter(function(s) { return Number(s.todayComments) < commentThreshold; })
    .sort(function(a, b) { return Number(b.todayComments) - Number(a.todayComments); });

  // 미제출자
  var submittedNicks = {};
  Object.keys(lastSubByNick).forEach(function(n) { submittedNicks[n] = true; });
  var nonSubmitters = participants.filter(function(p) { return !submittedNicks[p.nickname]; });

  // 메시지 조립
  var msg = '<b><u>📌' + formatKoreanDate(yesterday) + '</u></b>\n';
  msg += '21일 글쓰기 / Day ' + dayNum + ' (' + daysLeft + '일 남음)\n\n';

  // 댓글 완료
  msg += '<b>✅ 댓글 완료 (' + commentDone.length + '명)</b>\n\n';
  for (var a = 0; a < commentDone.length; a++) {
    var cs = commentDone[a];
    var ctitle = escHtml(cs.postTitle || cs.postLink || '제목 없음');
    msg += escHtml(cs.nickname) + '(' + (cs.todayComments || 0) + ') — ' + ctitle + '\n';
    if (cs.postLink) msg += cs.postLink + '\n';
    msg += '\n';
  }

  // 댓글 미완
  msg += '\n<b>📝 댓글 미완 (' + commentMiss.length + '명)</b>\n\n';
  for (var b = 0; b < commentMiss.length; b++) {
    var ms = commentMiss[b];
    var mtitle = escHtml(ms.postTitle || ms.postLink || '제목 없음');
    msg += escHtml(ms.nickname) + '(' + (ms.todayComments || 0) + ') — ' + mtitle + '\n';
    if (ms.postLink) msg += ms.postLink + '\n';
    msg += '\n';
  }

  // 미제출
  if (nonSubmitters.length > 0) {
    msg += '=================================\n\n';
    msg += '<b>❌ 미제출 (' + nonSubmitters.length + '명)</b>\n';
    for (var c = 0; c < nonSubmitters.length; c++) {
      msg += '• ' + escHtml(nonSubmitters[c].nickname) + '\n';
    }
  }

  sendTelegram(token, chatId, msg.trim());
}

// ── 매일 오전 5시 트리거 등록 (최초 1회만 실행) ──────────────────
// ※ 앱스스크립트 프로젝트 설정 → 시간대를 Asia/Seoul 로 맞춘 후 실행
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'dailyReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReport')
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .create();
  Logger.log('✓ 매일 오전 5시 트리거 등록 완료 (KST 기준)');
}
