import React from 'react'
import PropTypes from 'prop-types'
import { ButtonIcon, IconDown, IconUp, useTheme, RADIUS } from '@aragon/ui'

function ToggleButton({ onClick, opened }) {
  const theme = useTheme()
  return (
    <ButtonIcon label={opened ? 'Close' : 'Open'} focusRingRadius={RADIUS} onClick={onClick}>
      <div
        css={`
          transform: rotate3d(${opened ? 1 : 0}, 0, 0, 180deg);
          transform: rotate3d(0, 0, ${opened ? 1 : 0}, 180deg);
        `}
      >
        <IconUp size="small" />
      </div>
      <div
        css={`
          transform: rotate3d(${opened ? -1 : 0}, 0, 0, 180deg);
          transform: rotate3d(0, 0, ${opened ? -1 : 0}, 180deg);
        `}
      >
        <IconDown size="small" />
      </div>
    </ButtonIcon>
  )
}

ToggleButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  opened: PropTypes.bool.isRequired,
}

export { ToggleButton }
