const { expect } = require('chai');

const {
  BranchNameErrors,
  slugify,
  buildBranchName,
  getBranchNameError,
  validateBranchName,
} = require('../../utils/git-branch-name');

describe('git-branch-name', () => {
  describe('slugify', () => {
    it('lowercases and joins words with dashes', () => {
      expect(slugify('Implement Login Page')).to.equal('implement-login-page');
    });

    it('strips diacritics', () => {
      expect(slugify('Cálculo de Ñandú')).to.equal('calculo-de-nandu');
      expect(slugify('Über Façade')).to.equal('uber-facade');
    });

    it('collapses runs of other characters into one dash and trims dashes', () => {
      expect(slugify('  --Fix: bug #12 (urgent)!!  ')).to.equal('fix-bug-12-urgent');
      expect(slugify('a___b...c')).to.equal('a-b-c');
    });

    it('cuts to the maximum length without leaving a trailing dash', () => {
      expect(slugify('a'.repeat(60))).to.have.lengthOf(50);
      expect(slugify(`${'a'.repeat(49)} bcd`)).to.equal('a'.repeat(49));
      expect(slugify('abc def', { maxLength: 4 })).to.equal('abc');
    });

    it('returns an empty string when nothing is left', () => {
      expect(slugify('¡¿?!')).to.equal('');
      expect(slugify('日本語')).to.equal('');
      expect(slugify('')).to.equal('');
      expect(slugify(null)).to.equal('');
    });
  });

  describe('buildBranchName', () => {
    it('prefixes the slug with the issue IID', () => {
      expect(buildBranchName(12, 'Cálculo de impuestos')).to.equal('12-calculo-de-impuestos');
    });

    it('falls back to the IID alone when the slug is empty', () => {
      expect(buildBranchName(12, '???')).to.equal('12');
    });

    it('always builds a valid branch name', () => {
      expect(validateBranchName(buildBranchName(7, '.lock/..@{x}'))).to.equal(true);
    });
  });

  describe('getBranchNameError / validateBranchName', () => {
    const expectError = (name, error) => {
      expect(getBranchNameError(name)).to.equal(error);
      expect(validateBranchName(name)).to.equal(false);
    };

    it('accepts common branch names', () => {
      ['12-implement-login', 'feature/login', 'release/1.0', 'a', 'ñandú', 'a.b', 'x@y'].forEach(
        (name) => {
          expect(getBranchNameError(name)).to.equal(null);
          expect(validateBranchName(name)).to.equal(true);
        },
      );
    });

    it('rejects empty and non-string names', () => {
      expectError('', BranchNameErrors.EMPTY);
      expectError(null, BranchNameErrors.EMPTY);
      expectError(undefined, BranchNameErrors.EMPTY);
      expectError(12, BranchNameErrors.EMPTY);
    });

    it('rejects names longer than 255 UTF-8 bytes', () => {
      expect(validateBranchName('a'.repeat(255))).to.equal(true);
      expectError('a'.repeat(256), BranchNameErrors.TOO_LONG);
      // 128 two-byte characters = 256 bytes
      expectError('ñ'.repeat(128), BranchNameErrors.TOO_LONG);
    });

    it('rejects control characters and DEL', () => {
      expectError('bad\nname', BranchNameErrors.CONTROL_CHARACTER);
      expectError('bad\u0000name', BranchNameErrors.CONTROL_CHARACTER);
      expectError('bad\u007fname', BranchNameErrors.CONTROL_CHARACTER);
    });

    it('rejects spaces and ~ ^ : ? * [ \\', () => {
      ['a b', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b'].forEach((name) => {
        expectError(name, BranchNameErrors.FORBIDDEN_CHARACTER);
      });
    });

    it('rejects ".."', () => {
      expectError('bad..name', BranchNameErrors.DOUBLE_DOT);
    });

    it('rejects "@{"', () => {
      expectError('bad@{name', BranchNameErrors.AT_BRACE);
    });

    it('rejects "@" alone', () => {
      expectError('@', BranchNameErrors.AT_ONLY);
    });

    it('rejects a leading or trailing slash', () => {
      expectError('/name', BranchNameErrors.LEADING_OR_TRAILING_SLASH);
      expectError('name/', BranchNameErrors.LEADING_OR_TRAILING_SLASH);
    });

    it('rejects "//"', () => {
      expectError('a//b', BranchNameErrors.DOUBLE_SLASH);
    });

    it('rejects a path component starting with "."', () => {
      expectError('.hidden', BranchNameErrors.COMPONENT_STARTS_WITH_DOT);
      expectError('feature/.hidden', BranchNameErrors.COMPONENT_STARTS_WITH_DOT);
    });

    it('rejects a path component ending with ".lock"', () => {
      expectError('name.lock', BranchNameErrors.COMPONENT_ENDS_WITH_LOCK);
      expectError('feature.lock/name', BranchNameErrors.COMPONENT_ENDS_WITH_LOCK);
    });

    it('rejects a trailing "."', () => {
      expectError('name.', BranchNameErrors.TRAILING_DOT);
    });

    it('rejects a leading "-"', () => {
      expectError('-name', BranchNameErrors.LEADING_DASH);
    });
  });
});
