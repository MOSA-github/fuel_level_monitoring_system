export function readingStatus(row,now=Date.now()){
  const interval=Number(row.interval_minutes);
  const validInterval=Number.isFinite(interval)&&interval>=5&&interval<=10080;
  const updated=Date.parse(row.updated_at),attempted=Date.parse(row.attempted_at||row.updated_at);
  const age=Number.isFinite(attempted)?Math.max(0,now-attempted):null;
  const staleAfter=Math.max(30,validInterval?interval*3:30)*60000;
  const delayedAfter=Math.max(10,validInterval?interval*2:10)*60000;
  const stale=row.status==='normal'&&(!Number.isFinite(updated)||updated>now+300000||now-updated>staleAfter||!validInterval);
  const delayed=row.status!=='disabled'&&age!==null&&age>delayedAfter;
  return {valid:row.status==='normal'&&!stale&&Number.isFinite(row.value),stale,delayed,ageMinutes:age===null?null:Math.floor(age/60000),
    label:stale?'更新停止・期限切れ':row.status==='normal'?(delayed?'解析完了・次の更新が遅延':'解析完了'):row.status==='disabled'?'停止中':'取得・解析エラー',
    tone:stale||row.status==='error'?'error':delayed?'warn':''};
}
