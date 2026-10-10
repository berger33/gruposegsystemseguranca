// Funções puras compartilhadas pelo servidor e pela demonstração estática.
import { isPending } from './content.mjs';

const CODE_PATTERN = /^SGS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function normalizeCertificateCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function isCertificateCode(value) {
  return CODE_PATTERN.test(normalizeCertificateCode(value));
}

export function certificateWorkload(track) {
  const workloadMinutes = track.lessons
    .filter(lesson => !isPending(lesson))
    .reduce((total, lesson) => total + (Number(lesson.minutes) || 0), 0);
  return {
    workloadMinutes,
    workloadHours: Number((workloadMinutes / 60).toFixed(2)),
  };
}

export function trackCompletedBy(track, progress) {
  const published = track.lessons.filter(lesson => !isPending(lesson));
  return published.length > 0 && published.every(lesson => Boolean(progress && progress[lesson.id]));
}

// Nunca expõe o identificador interno da pessoa nem informações da sessão.
export function publicCertificate(record) {
  if (!record) return null;
  return {
    valid: true,
    code: record.code,
    recipientName: record.recipientName,
    trackId: record.trackId,
    trackTitle: record.trackTitle,
    workloadMinutes: record.workloadMinutes,
    workloadHours: record.workloadHours,
    issuedAt: record.issuedAt,
  };
}
