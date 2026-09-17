// getArrivalForecast 로직 검증 (telegram_notify.js와 동일 로직)
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');

function getArrivalForecast(routeKey) {
  const rawDir = path.join(DATA_DIR, 'raw');
  if (!fs.existsSync(rawDir)) return null;
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayYmd = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`;
  const files = fs.readdirSync(rawDir).filter(f => f.startsWith(routeKey + '_') && f.endsWith('.jsonl'));
  console.log('대상 파일:', files, '/ 오늘:', todayYmd);

  function rideStats(veh) {
    const rides = [];
    const segs = {};
    Object.values(veh).forEach(h => {
      let lastBelow16 = null;
      let done = false;
      for (let i = 0; i < h.length; i++) {
        if (done) break;
        const { seq, t } = h[i];
        if (seq <= 16) {
          lastBelow16 = t;
        } else if (seq >= 34) {
          if (lastBelow16 !== null) {
            const m = (t - lastBelow16) / 60000;
            if (m >= 10 && m <= 90) rides.push(Math.round(m));
          }
          done = true;
        } else if (i > 0) {
          const prev = h[i - 1];
          if (prev.seq >= 16 && prev.seq < seq) {
            const dm = (t - prev.t) / 60000;
            if (dm > 0 && dm <= 30) {
              const k = `${prev.seq}_${seq}`;
              if (!segs[k]) segs[k] = { total: 0, count: 0 };
              segs[k].total += dm;
              segs[k].count++;
            }
          }
        }
      }
    });
    return { rides, segs };
  }

  let today = null;
  const pastRides = [];
  const pastSegs = {};
  files.forEach(f => {
    const veh = {};
    fs.readFileSync(path.join(rawDir, f), 'utf8').split('\n').filter(Boolean).forEach(line => {
      try {
        const rec = JSON.parse(line);
        const list = rec.buses && rec.buses.msgBody && rec.buses.msgBody.busLocationList;
        if (!list) return;
        (Array.isArray(list) ? list : [list]).forEach(b => {
          if (!b || b.vehId === undefined) return;
          if (!veh[b.vehId]) veh[b.vehId] = [];
          veh[b.vehId].push({ seq: parseInt(b.stationSeq), t: new Date(rec.timestamp).getTime() });
        });
      } catch (e) {}
    });
    const r = rideStats(veh);
    if (f.includes(todayYmd)) { today = r; return; }
    pastRides.push(...r.rides);
    Object.entries(r.segs).forEach(([k, v]) => {
      if (!pastSegs[k]) pastSegs[k] = { total: 0, count: 0 };
      pastSegs[k].total += v.total;
      pastSegs[k].count += v.count;
    });
  });

  const todayAvg = today && today.rides.length
    ? Math.round(today.rides.reduce((a, b) => a + b, 0) / today.rides.length) : null;
  const pastAvg = pastRides.length
    ? Math.round(pastRides.reduce((a, b) => a + b, 0) / pastRides.length) : null;

  let worst = null;
  if (today && Object.keys(pastSegs).length > 0) {
    Object.entries(today.segs).forEach(([k, v]) => {
      const p = pastSegs[k];
      if (p && p.count > 0 && v.count > 0) {
        const diff = Math.round(v.total / v.count - p.total / p.count);
        if (!worst || diff > worst.diff) worst = { seg: k, diff };
      }
    });
  }
  return { todayAvg, pastAvg, todayCount: today ? today.rides.length : 0, worst, todayRides: today ? today.rides : [], pastSegKeys: Object.keys(pastSegs).length };
}

console.log(JSON.stringify(getArrivalForecast('1311'), null, 1));
