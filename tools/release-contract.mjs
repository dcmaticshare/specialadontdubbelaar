// Een opgeslagen OK-vlag is nooit voldoende: controleer inhoud, actualiteit en bijbehorende bytes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SETTINGS } from '../src/settings.js';
import { fileHash, checkDate, requireEqual } from './evidence.mjs';
import { checkMeasurements } from './performance-contract.mjs';

export const requiredChecks = ['openbaar', 'synthetischeKwaliteit', 'browser', 'privateVoorbeelden', 'privateBeoordelingen', 'prestaties', 'windows'];
export const windowsChecks = ['dubbelklik', 'fileProtocol', 'netwerkUit', 'geenInstallatie', 'ladenKoppelen', 'tweeLeads', 'tekstVeilig', 'export', 'herimport', 'excel', 'geenHerstelmelding'];

export function checkRelease(report, currentSource, currentHtml, now = Date.now()) {
  const errors = [];
  try { checkDate(report?.datum, now); } catch (e) { errors.push(e.message); }
  if (report?.versie !== 1 || report?.bronSha256 !== currentSource || report?.htmlSha256 !== currentHtml || !currentSource || !currentHtml) errors.push('Release hoort niet bij de actuele broncode en HTML.');
  for (const key of requiredChecks) {
    const check = report?.controles?.[key];
    if (check?.ok !== true || check?.exitcode !== 0 || !/^[a-f0-9]{64}$/.test(check?.bewijsSha256 || '')) errors.push(`Verplichte controle ontbreekt of faalt: ${key}.`);
  }
  return errors;
}

export function checkPrivateEvidence({ manifest, manifestHash, workbookHash, declaration, quality, policy, now = Date.now() }) {
  requireEqual(manifestHash, policy.manifestSha256, 'Verkeerde private set: het vaste manifest is verplicht.');
  requireEqual(manifest.records?.length, policy.records, 'Onvolledige private bronset.');
  requireEqual(manifest.pairs?.length, policy.paren, 'Onvolledige private parenset.');
  for (const [key, limit] of Object.entries(SETTINGS.kwaliteit.grenzen)) requireEqual(manifest.limits?.[key], limit, 'Kwaliteitsgrenzen zijn gewijzigd.');
  requireEqual(quality?.ok, true, 'De onafhankelijke private kwaliteitscontrole faalt.');
  for (const key of ['verwacht', 'gevonden', 'gecontroleerd']) requireEqual(quality.counts?.[key], policy.paren, 'Niet alle private paren zijn geldig beoordeeld.');
  for (const key of ['recordsVerwacht', 'recordsGevonden']) requireEqual(quality.counts?.[key], policy.records, 'Private bronrijen ontbreken.');
  if (quality.errors?.length !== 0 || quality.violations?.length !== 0) throw new Error('Private kwaliteitsfouten zijn niet opgelost.');
  for (const [key, limit] of Object.entries(SETTINGS.kwaliteit.grenzen)) {
    const value = quality.metrics?.[key];
    if (!Number.isSafeInteger(value) || value < 0 || value > limit) throw new Error('Private kwaliteitsgrens overschreden of meting ontbreekt.');
  }
  if (declaration?.versie !== 1 || typeof declaration.beoordelaar !== 'string' || !declaration.beoordelaar.trim() || declaration.onafhankelijk !== true || declaration.alleParenBeoordeeld !== true) throw new Error('Onafhankelijke menselijke beoordelingsverklaring ontbreekt.');
  checkDate(declaration.datum, now);
  requireEqual(declaration.manifestSha256, manifestHash, 'Verklaring hoort bij een ander manifest.');
  requireEqual(declaration.werkmapSha256, workbookHash, 'Beoordelingswerkmap is gewijzigd na de verklaring.');
}

export function checkPerformanceEvidence(report, currentSource, now = Date.now()) {
  const errors = checkMeasurements(report);
  if (errors.length) throw new Error(`Prestatiebewijs faalt: ${errors.join('; ')}`);
  checkDate(report.datum, now);
  requireEqual(report.bronSha256, currentSource, 'Prestatiemeting is verouderd voor deze broncode; meet opnieuw op de vaste referentiemachine.');
}

export function checkWindowsEvidence(report, { htmlHash, procedureHash, dir, now = Date.now(), hashFile = fileHash, checkWorkbook }) {
  if (typeof checkWorkbook !== 'function') throw new Error('Controle van de Windows-downloads ontbreekt.');
  if (report?.versie !== 1 || report.platform !== 'win32' || typeof report.windowsVersie !== 'string' || !report.windowsVersie.trim() || typeof report.beoordelaar !== 'string' || !report.beoordelaar.trim()) throw new Error('Werkelijk Windows-bewijs met beoordelaar en OS-versie ontbreekt.');
  checkDate(report.datum, now);
  requireEqual(report.htmlSha256, htmlHash, 'Windows-acceptatie hoort bij een andere HTML-build.');
  requireEqual(report.procedureSha256, procedureHash, 'Windows-acceptatie gebruikt een verouderde procedure.');
  if (!Array.isArray(report.browsers) || report.browsers.length !== 2) throw new Error('Edge én Chrome zijn vereist.');
  for (const browser of ['edge', 'chrome']) {
    const matches = report.browsers.filter((b) => b?.naam === browser);
    if (matches.length !== 1) throw new Error('Edge én Chrome moeten elk precies één keer zijn gecontroleerd.');
    const b = matches[0];
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(b.versie || '') || typeof b.excelVersie !== 'string' || !b.excelVersie.trim()) throw new Error('Browser- of Excel-versie ontbreekt.');
    for (const key of windowsChecks) requireEqual(b.controles?.[key], true, `Windows/${browser}: ${key} ontbreekt of faalt.`);
    for (const kind of ['export', 'herimport', 'schermafbeelding']) {
      const evidence = b.bestanden?.[kind];
      if (!evidence || typeof evidence.pad !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(evidence.pad) || evidence.pad === '.' || evidence.pad === '..') throw new Error('Windows-bijlage ontbreekt of heeft een ongeldig pad.');
      const file = path.join(dir, evidence.pad);
      requireEqual(hashFile(file), evidence.sha256, 'Windows-bijlage ontbreekt of is gewijzigd.');
      if (kind !== 'schermafbeelding') checkWorkbook(file, kind);
      else if (readFileSync(file).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Windows-schermafbeelding is geen PNG.');
    }
  }
}
