// Client-side mirror of the server's Git branch name rules (`git check-ref-format --branch`), used
// only to give early feedback: the server stays authoritative.

const MAX_BRANCH_NAME_BYTES = 255;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f]/;
const FORBIDDEN_CHARS_REGEX = /[ ~^:?*[\\]/;

// Returns true when the name is a valid branch name
export default (name) => {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }

  if (new TextEncoder().encode(name).length > MAX_BRANCH_NAME_BYTES) {
    return false;
  }

  if (
    CONTROL_CHARS_REGEX.test(name) ||
    FORBIDDEN_CHARS_REGEX.test(name) ||
    name.includes('..') ||
    name.includes('@{') ||
    name.includes('//') ||
    name === '@' ||
    name.startsWith('/') ||
    name.endsWith('/') ||
    name.startsWith('-') ||
    name.endsWith('.')
  ) {
    return false;
  }

  return name
    .split('/')
    .every((component) => !component.startsWith('.') && !component.endsWith('.lock'));
};
