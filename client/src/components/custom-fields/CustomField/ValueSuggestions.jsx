/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import React, { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { Popup } from 'semantic-ui-react';

import styles from './ValueSuggestions.module.scss';

// The list is at least as wide as the field it belongs to
const SAME_MIN_WIDTH_MODIFIER = {
  name: 'sameMinWidth',
  enabled: true,
  phase: 'beforeWrite',
  requires: ['computeStyles'],
  fn: ({ state }) => {
    // eslint-disable-next-line no-param-reassign
    state.styles.popper.minWidth = `${state.rects.reference.width}px`;
  },
};

const POPPER_MODIFIERS = [
  SAME_MIN_WIDTH_MODIFIER,
  {
    name: 'preventOverflow',
    enabled: true,
    options: {
      altAxis: true,
      padding: 8,
    },
  },
];

// Rendered in a portal (not clipped by the card modal), anchored to the field. The field keeps the
// focus while the list is used: mouse down is prevented, and the keyboard is handled by the field.
const ValueSuggestions = React.memo(({ id, open, contextRef, items, activeIndex, onSelect }) => {
  const listRef = useRef(null);

  const handleMouseDown = useCallback((event) => {
    event.preventDefault(); // Keeps the focus in the field
    event.stopPropagation(); // Otherwise the card modal takes it as an outside click
  }, []);

  const handleClick = useCallback((event) => {
    event.stopPropagation();
  }, []);

  useEffect(() => {
    if (!open || activeIndex === -1 || !listRef.current) {
      return;
    }

    const itemElement = listRef.current.children[activeIndex];

    if (itemElement) {
      itemElement.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [open, activeIndex]);

  return (
    <Popup
      basic
      context={contextRef}
      open={open}
      position="bottom left"
      popperModifiers={POPPER_MODIFIERS}
      className={styles.wrapper}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div ref={listRef} id={id} role="listbox" className={styles.items}>
        {items.map((item, index) => (
          <button
            key={item}
            type="button"
            tabIndex={-1}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            title={item}
            className={classNames(styles.item, index === activeIndex && styles.itemActive)}
            onClick={() => onSelect(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </Popup>
  );
});

ValueSuggestions.propTypes = {
  id: PropTypes.string.isRequired,
  open: PropTypes.bool.isRequired,
  contextRef: PropTypes.shape({
    current: PropTypes.object, // eslint-disable-line react/forbid-prop-types
  }).isRequired,
  items: PropTypes.arrayOf(PropTypes.string).isRequired,
  activeIndex: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default ValueSuggestions;
