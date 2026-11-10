// O prédio vive no horário de Brasília, seja qual for o relógio do computador.
const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function horaBrasilia(data) {
  const p = Object.fromEntries(formato.formatToParts(data).map(x => [x.type, x.value]));
  const h = Number(p.hour);
  return { hora: `${p.hour}:${p.minute}`, data: `${p.year}-${p.month}-${p.day}`, noite: h < 6 || h >= 18 };
}
