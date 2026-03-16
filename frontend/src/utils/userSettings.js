const STORAGE_PREFIX = 'smartshelf_user_settings_';

export const defaultUserSettings = {
  theme: 'system',
  accentColor: 'blue',
  preferredGenres: [],
  avoidedGenres: [],
  readingGoal: 40,
  recommendationStyle: 'balanced',
  tasteDriftSensitivity: 'moderate',
  reviewIntelligence: true,
  lastRecommendationResetAt: null,
};

function getSettingsKey(userId) {
  return `${STORAGE_PREFIX}${userId || 'guest'}`;
}

function normalizeArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
}

function mergeSettings(settings = {}) {
  return {
    ...defaultUserSettings,
    ...(settings || {}),
    preferredGenres: normalizeArray(settings?.preferredGenres),
    avoidedGenres: normalizeArray(settings?.avoidedGenres),
    readingGoal: Number(settings?.readingGoal) > 0 ? Number(settings.readingGoal) : defaultUserSettings.readingGoal,
    theme: ['light', 'dark', 'system'].includes(settings?.theme) ? settings.theme : defaultUserSettings.theme,
    recommendationStyle: ['safe', 'balanced', 'discovery'].includes(settings?.recommendationStyle)
      ? settings.recommendationStyle
      : defaultUserSettings.recommendationStyle,
    tasteDriftSensitivity: ['slow', 'moderate', 'aggressive'].includes(settings?.tasteDriftSensitivity)
      ? settings.tasteDriftSensitivity
      : defaultUserSettings.tasteDriftSensitivity,
    reviewIntelligence: typeof settings?.reviewIntelligence === 'boolean'
      ? settings.reviewIntelligence
      : defaultUserSettings.reviewIntelligence,
  };
}

export function loadUserSettings(userId) {
  try {
    const raw = localStorage.getItem(getSettingsKey(userId));
    if (!raw) return { ...defaultUserSettings };
    return mergeSettings(JSON.parse(raw));
  } catch {
    return { ...defaultUserSettings };
  }
}

export function saveUserSettings(userId, settings) {
  const merged = mergeSettings(settings);
  localStorage.setItem(getSettingsKey(userId), JSON.stringify(merged));
  return merged;
}

export function updateSetting(userId, key, value, currentSettings = {}) {
  const next = mergeSettings({
    ...currentSettings,
    [key]: value,
  });
  return saveUserSettings(userId, next);
}