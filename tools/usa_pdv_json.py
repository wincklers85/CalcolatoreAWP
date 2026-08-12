from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ['dashboard.html', 'letture.html', 'manutenzione.html', 'anagrafica.html', 'letture1.html']
OLD = './Dati/PDV-e-ESATTORI.xlsx'
NEW = './Dati/PDV-e-ESATTORI.json'
MARKER = 'async function fetchXLSX_largest(u,label){'
INJECT = "async function fetchXLSX_largest(u,label){if(/\\.json(?:$|\\?)/i.test(u)){const data=await fetchJSON(u,label);return{rows:Array.isArray(data)?data:(data.rows||[]),sheetName:'JSON'};}"

for name in FILES:
    path = ROOT / name
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    before = text
    if OLD in text:
        text = text.replace(OLD, NEW)
    if NEW in text and MARKER in text and INJECT not in text:
        text = text.replace(MARKER, INJECT, 1)
    if text != before:
        path.write_text(text, encoding='utf-8')
        print(f'Aggiornato {name}')

# Allarmi usa due loader distinti: xlsx() per i sinottici e json() per i dati statici.
path = ROOT / 'allarmi.html'
if path.exists():
    text = path.read_text(encoding='utf-8')
    before = text
    text = text.replace("xlsx('./Dati/PDV-e-ESATTORI.xlsx')", "json('./Dati/PDV-e-ESATTORI.json')")
    text = text.replace('for(const r of pdv.rows){', 'for(const r of pdv){')
    if text != before:
        path.write_text(text, encoding='utf-8')
        print('Aggiornato allarmi.html')
