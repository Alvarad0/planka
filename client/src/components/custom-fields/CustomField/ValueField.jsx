/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useDidUpdate, usePrevious, useToggle } from '../../../lib/hooks';
import { Input } from '../../../lib/custom-ui';

import { useEscapeInterceptor, useField, useNestedRef } from '../../../hooks';
import { findUsedValue } from '../../../selectors/custom-field-values';
import ValueSuggestions from './ValueSuggestions';

import styles from './ValueField.module.scss';

const filterSuggestions = (suggestions, value) => {
  const query = value.trim().toLocaleLowerCase();

  if (!query) {
    return suggestions;
  }

  return suggestions.filter((suggestion) => suggestion.toLocaleLowerCase().includes(query));
};

const ValueField = React.memo(({ defaultValue, suggestions, onUpdate, ...props }) => {
  const prevDefaultValue = usePrevious(defaultValue);
  const [value, handleChange, setValue] = useField(defaultValue || '');
  const [blurFieldState, blurField] = useToggle();
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [fieldRef, handleFieldRef] = useNestedRef('inputRef');
  const isFocusedRef = useRef(false);

  const suggestionsId = useId();

  const filteredSuggestions = useMemo(
    () => (suggestions ? filterSuggestions(suggestions, value) : []),
    [suggestions, value],
  );

  const isSuggestionsOpened = isFocused && filteredSuggestions.length > 0;

  const handleEscape = useCallback(() => {
    setValue(defaultValue || '');
    blurField();
  }, [defaultValue, setValue, blurField]);

  const [activateEscapeInterceptor, deactivateEscapeInterceptor] =
    useEscapeInterceptor(handleEscape);

  // Blurs after the next render, so the blur handler saves the picked value
  const handleSuggestionSelect = useCallback(
    (suggestion) => {
      setValue(suggestion);
      blurField();
    },
    [setValue, blurField],
  );

  const handleFocus = useCallback(() => {
    activateEscapeInterceptor();
    isFocusedRef.current = true;
    setIsFocused(true);
  }, [activateEscapeInterceptor]);

  const handleFieldChange = useCallback(
    (...args) => {
      handleChange(...args);
      setActiveIndex(-1);
    },
    [handleChange],
  );

  const handleKeyDown = useCallback(
    (event) => {
      switch (event.key) {
        case 'Enter':
          event.preventDefault();

          if (isSuggestionsOpened && filteredSuggestions[activeIndex] !== undefined) {
            handleSuggestionSelect(filteredSuggestions[activeIndex]);
          } else {
            fieldRef.current.blur();
          }

          break;
        case 'ArrowDown':
        case 'ArrowUp': {
          if (!isSuggestionsOpened) {
            break;
          }

          event.preventDefault();

          const step = event.key === 'ArrowDown' ? 1 : -1;
          const total = filteredSuggestions.length;

          setActiveIndex((prevActiveIndex) => {
            if (prevActiveIndex === -1) {
              return step === 1 ? 0 : total - 1;
            }

            return (prevActiveIndex + step + total) % total;
          });

          break;
        }
        default:
      }
    },
    [isSuggestionsOpened, filteredSuggestions, activeIndex, handleSuggestionSelect, fieldRef],
  );

  const handleBlur = useCallback(() => {
    deactivateEscapeInterceptor();
    isFocusedRef.current = false;
    setIsFocused(false);
    setActiveIndex(-1);

    let cleanValue = value.trim() || null;

    // Reuses the existing spelling, to avoid near-duplicate values
    if (cleanValue && suggestions) {
      cleanValue = findUsedValue(suggestions, cleanValue) || cleanValue;
    }

    if (cleanValue !== defaultValue) {
      onUpdate(cleanValue);
    }
  }, [defaultValue, suggestions, onUpdate, value, deactivateEscapeInterceptor]);

  useDidUpdate(() => {
    if (!isFocusedRef.current && defaultValue !== prevDefaultValue) {
      setValue(defaultValue || '');
    }
  }, [defaultValue, prevDefaultValue]);

  useDidUpdate(() => {
    fieldRef.current.blur();
  }, [blurFieldState]);

  // SUIR Input forwards aria-* props to the inner <input>, but not role (only through `input`)
  const comboboxProps = suggestions
    ? {
        input: { role: 'combobox' },
        autoComplete: 'off',
        'aria-autocomplete': 'list',
        'aria-expanded': isSuggestionsOpened,
        'aria-controls': suggestionsId,
        'aria-activedescendant':
          isSuggestionsOpened && activeIndex !== -1 ? `${suggestionsId}-${activeIndex}` : undefined,
      }
    : undefined;

  return (
    <>
      <Input
        {...props} // eslint-disable-line react/jsx-props-no-spreading
        {...comboboxProps} // eslint-disable-line react/jsx-props-no-spreading
        fluid
        ref={handleFieldRef}
        value={value}
        maxLength={512}
        className={styles.field}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onChange={handleFieldChange}
        onBlur={handleBlur}
      />
      {suggestions && (
        <ValueSuggestions
          id={suggestionsId}
          open={isSuggestionsOpened}
          contextRef={fieldRef}
          items={filteredSuggestions}
          activeIndex={activeIndex}
          onSelect={handleSuggestionSelect}
        />
      )}
    </>
  );
});

ValueField.propTypes = {
  defaultValue: PropTypes.string,
  suggestions: PropTypes.arrayOf(PropTypes.string),
  onUpdate: PropTypes.func.isRequired,
};

ValueField.defaultProps = {
  defaultValue: undefined,
  suggestions: undefined,
};

export default ValueField;
