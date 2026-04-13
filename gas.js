// ═══════════════════════════════════════════════════════════════
// 21일 글쓰기 챌린지 — Google Apps Script
// 이 파일 전체를 구글 앱스스크립트에 붙여넣고 배포하세요.
// ═══════════════════════════════════════════════════════════════

const SHEET_NAMES = {
  participants: '참가자',
  submissions:  '제출',
  hof:          '명예의전당',
  config:       '설정',
};

// ── 헤더 정의 ──────────────────────────────────────────────────
const HEADERS = {
  participants: ['nickname','blogUrl','startLevel','registeredAt'],
  submissions:  ['nickname','level','postTitle','postLink','todayComments',
                 'yesterdayViews','inquiry','revenue','revenueAmt','memo','submittedAt'],
  hof:          ['name','review','storyUrl','blogUrl','totalViews','inquiry','imgUrl','addedAt'],
  config:       ['key','value'],
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

    if (action === 'deleteParticipant') {
      deleteRow('participants', 'nickname', data.nickname);
      return corsOutput({ status: 'ok' });
    }

    if (action === 'saveConfig') {
      Object.entries(data).forEach(([key, value]) => {
        upsertRow('config', { key, value: String(value) }, 'key');
      });
      return corsOutput({ status: 'ok' });
    }

    return corsOutput({ status: 'error', message: '알 수 없는 action: ' + action });

  } catch(err) {
    return corsOutput({ status: 'error', message: err.toString() });
  }
}
