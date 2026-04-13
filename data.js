// ─── 공용 데이터 레이어 ───────────────────────────────────────
// localStorage + Google Sheets 연동
// SHEETS_URL 설정 시 자동으로 양방향 동기화

const DB = {

  // ── 구글 시트 URL 설정 ──────────────────────────────────────
  _DEFAULT_SHEETS_URL: 'https://script.google.com/macros/s/AKfycbzUHU9IY4pkJJUEvyu00RDw3bLS0j_S4jqjZ-P9fR5i83w1gk-nO5Cr6In3xtUmZrD7/exec',

  get SHEETS_URL() {
    return localStorage.getItem('sheetsUrl') || this._DEFAULT_SHEETS_URL;
  },
  set SHEETS_URL(url) {
    if (url) localStorage.setItem('sheetsUrl', url.trim());
    else     localStorage.removeItem('sheetsUrl');
  },

  isConnected() {
    return !!this.SHEETS_URL;
  },

  // ── 구글 시트 POST (fire & forget) ──────────────────────────
  _post(action, data) {
    if (!this.SHEETS_URL) return;
    const body = new URLSearchParams({ action, data: JSON.stringify(data) });
    fetch(this.SHEETS_URL, { method: 'POST', body })
      .catch(e => console.warn('[Sheets POST 실패]', action, e));
  },

  // ── 구글 시트에서 전체 데이터 가져와 localStorage 갱신 ──────
  async pullFromSheets() {
    if (!this.SHEETS_URL) return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃
      const res = await fetch(`${this.SHEETS_URL}?action=getAll`, { signal: controller.signal });
      clearTimeout(timer);
      const text = await res.text();
      let d;
      try { d = JSON.parse(text); }
      catch(e) { throw new Error('응답이 JSON이 아닙니다. 앱스스크립트 URL을 브라우저에서 직접 열어 권한을 먼저 승인하세요.'); }
      if (d.status !== 'ok') throw new Error(d.message);
      if (d.spreadsheetUrl) localStorage.setItem('spreadsheetUrl', d.spreadsheetUrl);

      // 참가자
      if (Array.isArray(d.participants) && d.participants.length) {
        localStorage.setItem('participants', JSON.stringify(d.participants));
      }
      // 제출
      if (Array.isArray(d.submissions) && d.submissions.length) {
        localStorage.setItem('submissions', JSON.stringify(d.submissions));
      }
      // HOF — 배열을 {name: {...}} 형태로 변환해서 저장
      if (Array.isArray(d.hof) && d.hof.length) {
        const hofMap = {};
        d.hof.forEach(entry => {
          if (!entry.name) return;
          hofMap[entry.name] = {
            review:     entry.review     || '',
            storyUrl:   entry.storyUrl   || '',
            blogUrl:    entry.blogUrl    || '',
            inquiry:    entry.inquiry    || 'X',
            totalViews: entry.totalViews || '',
            imgUrl:     entry.imgUrl     || '',
          };
        });
        localStorage.setItem('hof', JSON.stringify(hofMap));
      }

      // 챌린지 설정
      if (d.config && typeof d.config === 'object' && d.config.startDate) {
        localStorage.setItem('challengeConfig', JSON.stringify({
          startDate: d.config.startDate,
          totalDays: Number(d.config.totalDays) || 21,
        }));
      }

      console.log('[Sheets] 동기화 완료');
      return true;
    } catch (e) {
      console.warn('[Sheets pull 실패]', e);
      return false;
    }
  },

  // ── 참가자 ──────────────────────────────────────────────────
  getParticipants() {
    return JSON.parse(localStorage.getItem('participants') || '[]');
  },

  saveParticipant(data) {
    const list   = this.getParticipants();
    const exists = list.findIndex(p => p.nickname === data.nickname);
    const entry  = exists >= 0
      ? { ...list[exists], ...data }
      : { ...data, registeredAt: new Date().toISOString() };

    if (exists >= 0) list[exists] = entry;
    else             list.push(entry);

    localStorage.setItem('participants', JSON.stringify(list));
    this._post('saveParticipant', entry);
  },

  deleteParticipant(nickname) {
    const list = this.getParticipants().filter(p => p.nickname !== nickname);
    localStorage.setItem('participants', JSON.stringify(list));
    this._post('deleteParticipant', { nickname });
  },

  // ── 일일 제출 ────────────────────────────────────────────────
  getSubmissions() {
    return JSON.parse(localStorage.getItem('submissions') || '[]');
  },

  saveSubmission(data) {
    const list  = this.getSubmissions();
    const entry = { ...data, submittedAt: new Date().toISOString() };
    list.push(entry);
    localStorage.setItem('submissions', JSON.stringify(list));
    this._post('saveSubmission', entry);
  },

  // ── 명예의전당 ───────────────────────────────────────────────
  getHofData() {
    return JSON.parse(localStorage.getItem('hof') || '{}');
  },

  saveHofEntry(name, { review, storyUrl, blogUrl, inquiry, totalViews, imgUrl }) {
    const hof  = this.getHofData();
    const entry = {
      review:     review     || '',
      storyUrl:   storyUrl   || '',
      blogUrl:    blogUrl    || '',
      inquiry:    inquiry    || 'X',
      totalViews: totalViews || '',
      imgUrl:     imgUrl     || '',
    };
    hof[name] = entry;
    localStorage.setItem('hof', JSON.stringify(hof));

    // 시트에 이미지 포함해서 저장
    this._post('saveHof', {
      name,
      addedAt: new Date().toISOString(),
      ...entry,
    });
  },

  removeHofEntry(name) {
    const hof = this.getHofData();
    delete hof[name];
    localStorage.setItem('hof', JSON.stringify(hof));
    this._post('deleteHof', { name });
  },

  // ── 대시보드용 집계 ──────────────────────────────────────────
  getDashboardRows() {
    const participants = this.getParticipants();
    const submissions  = this.getSubmissions();
    const hof          = this.getHofData();

    // 참가자 기반 행
    const participantRows = participants.map(p => {
      const mine   = submissions.filter(s => s.nickname === p.nickname);
      const latest = mine.length ? mine[mine.length - 1] : null;

      return {
        nickname:      p.nickname,
        blogUrl:       p.blogUrl || '',
        level:         latest?.level || p.startLevel || '브론즈',
        posts:         mine.filter(s => s.postLink).map(s => ({
                         title: s.postTitle || s.postLink,
                         link:  s.postLink,
                         date:  s.submittedAt ? s.submittedAt.slice(0,10) : '',
                       })),
        totalPosts:    mine.length,
        totalComments: mine.reduce((a, s) => a + (Number(s.todayComments) || 0), 0),
        totalViews:    mine.reduce((a, s) => a + (Number(s.yesterdayViews) || 0), 0),
        inquiry:       mine.some(s => s.inquiry === 'O') ? 'O' : 'X',
        revenue:       mine.some(s => s.revenue === 'O') ? 'O' : 'X',
        revenueAmt:    latest?.revenueAmt || '',
        review:        '',
        storyUrl:      '',
        imgUrl:        '',
      };
    });

    // HOF 전용 행 (관리자가 직접 추가한 경우)
    const participantNames = new Set(participants.map(p => p.nickname));
    const hofOnlyRows = Object.entries(hof)
      .filter(([name]) => !participantNames.has(name))
      .map(([name, d]) => ({
        nickname:      name,
        level:         '명예의전당',
        posts:         [],
        totalPosts:    0,
        totalComments: 0,
        totalViews:    Number(d.totalViews) || 0,
        inquiry:       d.inquiry   || 'X',
        revenue:       'X',
        revenueAmt:    '',
        review:        d.review    || '',
        storyUrl:      d.storyUrl  || '',
        blogUrl:       d.blogUrl   || '',
        imgUrl:        d.imgUrl    || '',
      }));

    return [...hofOnlyRows, ...participantRows];
  },

  // ── 챌린지 설정 ─────────────────────────────────────────────
  getChallengeConfig() {
    return JSON.parse(localStorage.getItem('challengeConfig') || '{"startDate":"","totalDays":21}');
  },

  saveChallengeConfig(config) {
    localStorage.setItem('challengeConfig', JSON.stringify(config));
    this._post('saveConfig', config);
  },

  // 오늘이 챌린지 D+몇 인지 (시작일 미설정 시 null)
  getDayNumber() {
    const { startDate, totalDays } = this.getChallengeConfig();
    if (!startDate) return null;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - start) / 86400000) + 1;
    return Math.min(Math.max(1, diff), totalDays || 21);
  },

  // 오늘 미제출 참가자 목록
  getTodayNonSubmitters() {
    const participants = this.getParticipants();
    const submissions  = this.getSubmissions();
    const today = new Date().toISOString().slice(0, 10);
    const submitted = new Set(
      submissions
        .filter(s => s.submittedAt && s.submittedAt.slice(0, 10) === today)
        .map(s => s.nickname)
    );
    return participants
      .filter(p => !submitted.has(p.nickname))
      .map(p => ({ nickname: p.nickname, level: p.startLevel || '브론즈' }));
  },

  // 오늘 제출한 참가자 목록
  getTodaySubmitters() {
    const submissions = this.getSubmissions();
    const today = new Date().toISOString().slice(0, 10);
    return submissions.filter(s => s.submittedAt && s.submittedAt.slice(0, 10) === today);
  },

  // ── 개발용: 전체 초기화 ──────────────────────────────────────
  reset() {
    localStorage.removeItem('participants');
    localStorage.removeItem('submissions');
    localStorage.removeItem('hof');
    localStorage.removeItem('challengeConfig');
    console.log('로컬 데이터 초기화 완료');
  }
};
