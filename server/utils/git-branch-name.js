// Pure helpers to build and validate Git branch names (GitLab Bridge).
//
// validateBranchName implements the rules of `git check-ref-format --branch`, so a name accepted
// here is never rejected by GitLab for its shape.

const DEFAULT_SLUG_MAX_LENGTH = 50;
const MAX_BRANCH_NAME_BYTES = 255;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f]/;
const FORBIDDEN_CHARS_REGEX = /[ ~^:?*[\\]/;

const BranchNameErrors = {
  EMPTY: 'empty',
  TOO_LONG: 'tooLong',
  CONTROL_CHARACTER: 'controlCharacter',
  FORBIDDEN_CHARACTER: 'forbiddenCharacter',
  DOUBLE_DOT: 'doubleDot',
  AT_BRACE: 'atBrace',
  AT_ONLY: 'atOnly',
  LEADING_OR_TRAILING_SLASH: 'leadingOrTrailingSlash',
  DOUBLE_SLASH: 'doubleSlash',
  COMPONENT_STARTS_WITH_DOT: 'componentStartsWithDot',
  COMPONENT_ENDS_WITH_LOCK: 'componentEndsWithLock',
  TRAILING_DOT: 'trailingDot',
  LEADING_DASH: 'leadingDash',
};

// "Cálculo de Ñandú!" -> "calculo-de-nandu". The result may be empty (e.g. only symbols).
const slugify = (text, { maxLength = DEFAULT_SLUG_MAX_LENGTH } = {}) => {
  const slug = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.slice(0, maxLength).replace(/-+$/, '');
};

const buildBranchName = (issueIid, text) => {
  const slug = slugify(text);

  return slug ? `${issueIid}-${slug}` : String(issueIid);
};

// Returns the first broken rule (one of BranchNameErrors), or null when the name is valid
const getBranchNameError = (name) => {
  if (typeof name !== 'string' || name.length === 0) {
    return BranchNameErrors.EMPTY;
  }

  if (Buffer.byteLength(name, 'utf8') > MAX_BRANCH_NAME_BYTES) {
    return BranchNameErrors.TOO_LONG;
  }

  if (CONTROL_CHARS_REGEX.test(name)) {
    return BranchNameErrors.CONTROL_CHARACTER;
  }

  if (FORBIDDEN_CHARS_REGEX.test(name)) {
    return BranchNameErrors.FORBIDDEN_CHARACTER;
  }

  if (name.includes('..')) {
    return BranchNameErrors.DOUBLE_DOT;
  }

  if (name.includes('@{')) {
    return BranchNameErrors.AT_BRACE;
  }

  if (name === '@') {
    return BranchNameErrors.AT_ONLY;
  }

  if (name.startsWith('/') || name.endsWith('/')) {
    return BranchNameErrors.LEADING_OR_TRAILING_SLASH;
  }

  if (name.includes('//')) {
    return BranchNameErrors.DOUBLE_SLASH;
  }

  const components = name.split('/');

  if (components.some((component) => component.startsWith('.'))) {
    return BranchNameErrors.COMPONENT_STARTS_WITH_DOT;
  }

  if (components.some((component) => component.endsWith('.lock'))) {
    return BranchNameErrors.COMPONENT_ENDS_WITH_LOCK;
  }

  if (name.endsWith('.')) {
    return BranchNameErrors.TRAILING_DOT;
  }

  if (name.startsWith('-')) {
    return BranchNameErrors.LEADING_DASH;
  }

  return null;
};

const validateBranchName = (name) => getBranchNameError(name) === null;

module.exports = {
  BranchNameErrors,
  slugify,
  buildBranchName,
  getBranchNameError,
  validateBranchName,
};
