const path = require("path");

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,          // Ganache GUI default
      network_id: "*",  // match Ganache's Network ID
    },
  },

  // 🔒 Force Truffle to only look inside THIS project
  contracts_directory: path.join(__dirname, "contracts"),
  contracts_build_directory: path.join(__dirname, "build", "contracts"),

  compilers: {
    solc: {
      version: "0.5.16",           // 👈 matches your pragma/log
      settings: {
        optimizer: { enabled: true, runs: 200 },
      },
    },
  },
};
