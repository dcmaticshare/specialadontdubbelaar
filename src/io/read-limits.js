// Goedkope invoercontroles vóór decoderen, uitpakken en opbouwen van tekstrijen.
import { SETTINGS } from '../settings.js';

export function assertFileSize(size) {
  if (size > SETTINGS.inlezen.maxBestandBytes) {
    throw new Error(`Bestand is te groot: maximaal ${SETTINGS.inlezen.maxBestandBytes} bytes ` +
      `(${SETTINGS.inlezen.maxBestandBytes / 1024 / 1024} MiB). Splits de lijst in kleinere bestanden.`);
  }
}

export function assertCellCount(count) {
  if (!Number.isSafeInteger(count) || count < 0 || count > SETTINGS.inlezen.maxCellen) {
    throw new Error(`Bestand bevat een te grote tabel: maximaal ${SETTINGS.inlezen.maxCellen} cellen ` +
      '(rijen × kolommen, inclusief lege cellen en alle tabbladen samen). ' +
      'Splits de lijst of verwijder ongebruikte rijen, kolommen en tabbladen.');
  }
}

// XLSX/XLSM/XLSB/ODS zijn ZIP-bestanden. Lees alleen de index, zonder iets uit te pakken.
// Dit begrenst gedeclareerde groottes; het is geen volledige verificatie van gecomprimeerde inhoud.
export function assertWorkbookArchive(bytes) {
  if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const invalid = () => { throw new Error('Excel-archief is beschadigd of gebruikt een niet ondersteund ZIP-formaat. Exporteer het opnieuw als gewone XLSX of CSV.'); };
  // Een ZIP-slotrecord heeft 22 bytes, gevolgd door hoogstens 65535 commentaarbytes.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) {
      end = i; break;
    }
  }
  if (end < 0) invalid();
  const entries = view.getUint16(end + 10, true);
  const length = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);
  // Geen meerdelige archieven of ZIP64: hun groottes kunnen hier niet veilig worden vastgesteld.
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) ||
      view.getUint16(end + 8, true) !== entries || entries === 0xffff ||
      length === 0xffffffff || start === 0xffffffff || start + length !== end) invalid();
  if (entries > SETTINGS.inlezen.maxArchiefBestanden) {
    throw new Error(`Excel-archief bevat te veel onderdelen: maximaal ${SETTINGS.inlezen.maxArchiefBestanden}. Splits de werkmap.`);
  }
  let offset = start;
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) invalid();
    const compressed = view.getUint32(offset + 20, true);
    const unpacked = view.getUint32(offset + 24, true);
    total += unpacked;
    if (total > SETTINGS.inlezen.maxUitgepaktBytes) {
      throw new Error(`Excel-archief is uitgepakt te groot: maximaal ${SETTINGS.inlezen.maxUitgepaktBytes} bytes. Splits de werkmap of gebruik CSV.`);
    }
    const local = view.getUint32(offset + 42, true);
    if (compressed === 0xffffffff || view.getUint16(offset + 34, true) ||
        local + 30 > start || view.getUint32(local, true) !== 0x04034b50) invalid();
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    if ((flags & 1) || ![0, 8].includes(method) || view.getUint16(local + 6, true) !== flags ||
        view.getUint16(local + 8, true) !== method) invalid();
    const data = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (data + compressed > start || (method === 0 && compressed !== unpacked)) invalid();
    // Met een data descriptor staan de groottes pas in de centrale index.
    if (!(flags & 8) && (view.getUint32(local + 18, true) !== compressed ||
        view.getUint32(local + 22, true) !== unpacked)) invalid();
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (offset > end) invalid();
  }
  if (offset !== end) invalid();
}
