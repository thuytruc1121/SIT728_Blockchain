module.exports = {
    port: 8545,
    server: {
        baseDir: ["./src", "./build/contracts"],
        routes: { "/node_modules": "node_modules" }
    },
    open: true
};
