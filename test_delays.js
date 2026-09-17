// 버스 지체 추정 테스트
const fs = require('fs');
const path = require('path');
const DATA_DIR = 'C:/thinksome/data';

const now = new Date();
const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const dateStr = `${kst.getUTCFullYear()}${String(kst.getUTCMonth()+1).padStart(2,'0')}${String(kst.getUTCDate()).padStart(2,'0')}`;
const filepath = path.join(DATA_DIR, 'raw', `1311_${dateStr}.jsonl`);

console.log('파일:', filepath);
if (!fs.existsSync(filepath)) {
  console.log('파일 없음');
  process.exit();
}

const lines = fs.readFileSync(filepath, 'utf8').split('\n').filter(l => l.trim());
console.log('라인 수:', lines.length);

const busHistory = {};
lines.forEach(line => {
  try {
    const record = JSON.parse(line);
    const buses = record.buses?.msgBody?.busLocationList;
    if (!buses) return;
    const busList = Array.isArray(buses) ? buses : [buses];
    const ts = new Date(record.timestamp).getTime();
    busList.forEach(bus => {
      const vehId = bus.vehId;
      const seq = parseInt(bus.stationSeq);
      if (!busHistory[vehId]) busHistory[vehId] = [];
      busHistory[vehId].push({ seq, time: ts });
    });
  } catch (e) {}
});

console.log('버스 수:', Object.keys(busHistory).length);

const delays = {};
Object.entries(busHistory).forEach(([vehId, history]) => {
  if (history.length < 2) return;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i-1];
    const curr = history[i];
    if (prev.seq === curr.seq) {
      const delayMin = Math.round((curr.time - prev.time) / 60000);
      if (delayMin >= 2) {
        if (!delays[prev.seq] || delayMin > delays[prev.seq]) {
          delays[prev.seq] = delayMin;
        }
      }
    }
  }
});

console.log('지체 구간:', JSON.stringify(delays));
