import React from 'react'
import { ButtonIcon, IconFilter } from '@aragon/ui'

export default props => (
  <ButtonIcon
    label="Toggle filters"
    {...props}
    css={`
      float: right;
    `}
  >
    <IconFilter color={props.active ? '#00CBE6' : ''} />
  </ButtonIcon>
)
