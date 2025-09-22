const FoodSupplyChain = artifacts.require("FoodSupplyChain");

module.exports = function (deployer) {
    deployer.then(async () => {
        const foodSupplyChain = await FoodSupplyChain.deployed();

        // Authorize warehouse
        const warehouseAddress = "0xB4F1A67fec31ff504Df0C64fE456B1F4f63165E0";
        await foodSupplyChain.authorizeWarehouse(warehouseAddress);
        console.log(`Authorized warehouse: ${warehouseAddress}`);

        // Authorize stores
        const storeAddresses = [
            "0x0Aea37631823f63bE96694ba14fE7e0C5bd61E4A",
            "0x745C9102C727ccf84159Cd5E193b32583BC371c5"
        ];

        for (const storeAddress of storeAddresses) {
            await foodSupplyChain.authorizeStore(storeAddress);
            console.log(`Authorized store: ${storeAddress}`);
        }
    });
};
