import React from 'react'
import styled from 'styled-components'
import { Box } from '@aragon/ui'
import Chart from '../components/Chart'

export default ({ bondedToken, overview, polledTotalSupply }) => {
  const { price, reserve, tap } = overview
  const marketCap = price * (polledTotalSupply || bondedToken.totalSupply)
  return (
    <div>
      <KeyMetrics heading="Key metrics" padding={false}>
        <ul>
          <li>
            <div>
              <p className="title">Price</p>
              <p className="number">${price}</p>
            </div>
            <p className="sub-number green">+$4.82 (0.5%)</p>
          </li>
          <li>
            <div>
              <p className="title">Market Cap</p>
              <p className="number">${marketCap}</p>
            </div>
            <p className="sub-number green">+$4.82M</p>
          </li>
          <li>
            <div>
              <p className="title">Trading Volume</p>
              <p className="number">$1.5 M</p>
            </div>
            <p className="sub-number green">$48M (Y)</p>
          </li>
          <li>
            <div>
              <p className="title">Token Supply</p>
              <p className="number">{polledTotalSupply || bondedToken.totalSupply}</p>
            </div>
            <p className="sub-number red">-$23.82 (0.5%)</p>
          </li>
          <li>
            <div>
              <p className="title">Reserves</p>
              <p className="number">{reserve}</p>
            </div>
            <p className="sub-number red">-$0.82M</p>
          </li>
          <li>
            <div>
              <p className="title">Monthly Allowance</p>
              <p className="number">{tap}</p>
            </div>
            <p className="sub-number green">$48M (Y)</p>
          </li>
        </ul>
      </KeyMetrics>
      <Chart />
    </div>
  )
}

const KeyMetrics = styled(Box)`
  margin-bottom: 1rem;

  .green {
    color: #2cc68f;
  }

  .red {
    color: #fb7777;
  }

  .title {
    margin-bottom: 1rem;
    font-weight: 600;
  }

  ul {
    display: flex;
    justify-content: space-between;
    background: #fff;
    box-sizing: border-box;
    border-radius: 3px;
    padding: 1rem;
  }

  li {
    list-style-type: none;

    img {
      display: inline-block;
      height: 16px;
      margin-right: 0.5rem;
    }

    .title {
      display: flex;
      font-size: 16px;
      font-weight: 300;
      color: #637381;
      white-space: nowrap;
      margin-bottom: 0.75rem;
    }

    .number {
      margin-bottom: 1rem;
      font-size: 26px;
      line-height: 24px;
    }

    .sub-number {
      font-size: 16px;
    }
  }

  @media only screen and (max-width: 1152px) {
    ul {
      display: flex;
      flex-direction: column;
      padding: 0;
    }

    li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      border-bottom: 1px solid #dde4e9;

      .number {
        margin-bottom: 0;
      }
    }

    li:last-child {
      border-bottom: none;
    }
  }
`
