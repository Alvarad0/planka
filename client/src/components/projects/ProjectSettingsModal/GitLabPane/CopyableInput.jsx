import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Input } from 'semantic-ui-react';

const COPIED_STATE_DURATION = 1000;

const CopyableInput = React.memo(({ value, className }) => {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef(null);

  const handleCopyClick = useCallback(() => {
    navigator.clipboard.writeText(value);
    setIsCopied(true);

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsCopied(false), COPIED_STATE_DURATION);
  }, [value]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <Input
      fluid
      readOnly
      value={value}
      action={{
        type: 'button',
        icon: isCopied ? 'check' : 'copy',
        onClick: handleCopyClick,
      }}
      className={className}
    />
  );
});

CopyableInput.propTypes = {
  value: PropTypes.string.isRequired,
  className: PropTypes.string,
};

CopyableInput.defaultProps = {
  className: undefined,
};

export default CopyableInput;
