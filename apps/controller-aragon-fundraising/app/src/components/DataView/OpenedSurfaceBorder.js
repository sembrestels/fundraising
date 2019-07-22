import React from 'react'
import PropTypes from 'prop-types'
import { springs, useTheme } from '@aragon/ui'
import { Spring, animated } from 'react-spring'

function OpenedSurfaceBorder({ opened, ...props }) {
  const theme = useTheme()
  return (
    <Spring native from={{ width: 0 }} to={{ width: Number(opened) }} config={{ ...springs.smooth }}>
      {({ width }) => (
        <animated.div
          css={`
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 3px;
            background: ${theme.surfaceOpened};
            transform-origin: 0 0;
          `}
          style={{
            transform: width.interpolate(v => `scale3d(${v}, 1, 1)`),
          }}
          {...props}
        />
      )}
    </Spring>
  )
}

OpenedSurfaceBorder.propTypes = {
  opened: PropTypes.bool,
}

export { OpenedSurfaceBorder }
