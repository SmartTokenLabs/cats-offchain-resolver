import { task } from 'hardhat/config';
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";

require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');

require("dotenv").config("G:/ensdeploy/.env");
//require("dotenv").config();

let { PRIVATE_KEY, ETHERSCAN_API_KEY, INFURA_KEY } = process.env;

PRIVATE_KEY = PRIVATE_KEY ? PRIVATE_KEY : "0x2222453C7891EDB92FE70662D5E45A453C7891EDB92FE70662D5E45A453C7891";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// module.exports = {
//   networks: {
//     mainnet: {
//       gasPrice: 20000000000 
//     },
//     goerli: {
//       gasPrice: 2000000000
//     }
//   }
// };


// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },
  networks: {
    mainnet: {
      url: `https://rpc.ankr.com/eth`, //ths RPC seems to work more consistently
      accounts: [`${PRIVATE_KEY}`],
      gasPrice: 20000000000
    },
    mumbai: {
      url: `https://matic-mumbai.chainstacklabs.com`, //ths RPC seems to work more consistently
      accounts: [`${PRIVATE_KEY}`]
    },
    goerli: {
      url: `https://ethereum-goerli.publicnode.com`, //ths RPC seems to work more consistently
      accounts: [`${PRIVATE_KEY}`],
      gasPrice: 2000000000
    },
    bsc: {
      url: `https://bsc-dataseed1.binance.org:443`,
      accounts: [`${PRIVATE_KEY}`]  
    },
    xdai: {
      url: `https://rpc.xdaichain.com/`,
      accounts: [`${PRIVATE_KEY}`]
    },
    polygon: {
      url: `https://matic-mainnet.chainstacklabs.com`,
      accounts: [`${PRIVATE_KEY}`]
    }
  },
  etherscan: {
    apiKey: `${ETHERSCAN_API_KEY}`
  }

};
