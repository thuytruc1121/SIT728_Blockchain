// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

/**
 * @title FoodSupplyChain
 * @notice A simple supply chain tracking system for study/demo purposes
 */
contract FoodSupplyChain {
    enum Stage {
        Created,
        Transported,
        Warehoused,
        Store,
        Sold
    }

    struct Batch {
        // a batch of food item includes name, origin, stage, current holder, expiry date, condition, batch size, and creator
        uint id; // id of the batch
        string name;
        string origin; // origin of the batch
        Stage stage; // stage of the batch (Created, Transported, Warehoused, Store, Sold)
        address currentHolder; // current holder of the batch
        uint expiryDate; // expiry date of the batch
        bool conditionOk; // condition of the batch (true if the batch is ok, false if the batch is not ok)
        uint batchSize; // number of boxes in the batch
        address creator; // address of the batch creator
    }

    uint public batchCount; // count of the batches this is set to public so that it can be accessed by the frontend
    mapping(uint => Batch) public batches; // mapping of the batches this is set to public so that it can be accessed by the frontend

    // Role-based access control
    mapping(address => bool) public warehouses; // addresses authorized as warehouses
    mapping(address => bool) public stores; // addresses authorized as stores

    event BatchCreated(
        uint id,
        string name,
        string origin,
        address indexed creator
    ); // event for the creation of a new batch
    event StageUpdated(uint id, Stage newStage, address indexed holder); // event for the update of the stage of a batch
    event ConditionUpdated(uint id, bool conditionOk); // event for the update of the condition of a batch
    event BatchSold(uint id, address indexed store); // event for when a batch is marked as sold
    event WarehouseAuthorized(address indexed warehouse); // event for warehouse authorization
    event StoreAuthorized(address indexed store); // event for store authorization

    modifier onlyHolder(uint _id) {
        // modifier for the only holder of a batch
        require(
            msg.sender == batches[_id].currentHolder,
            "Not the current holder"
        );
        _;
    }

    modifier onlyWarehouse() {
        // modifier for warehouse operations
        require(warehouses[msg.sender], "Not authorized as warehouse");
        _;
    }

    modifier onlyStore() {
        // modifier for store operations
        require(stores[msg.sender], "Not authorized as store");
        _;
    }

    /// Create a new food batch
    function createBatch(
        string calldata _name, // name of the food batch
        string calldata _origin, // origin of the food batch
        uint _expiryDate, // expiry date of the food batch
        uint _batchSize // number of boxes in the batch
    ) external {
        // function to create a new food batch
        batchCount++;
        batches[batchCount] = Batch(
            batchCount, // id of the batch
            _name,
            _origin,
            Stage.Created, // stage of the batch
            msg.sender, // current holder of the batch
            _expiryDate, // expiry date of the batch
            true, // condition of the batch
            _batchSize, // number of boxes in the batch
            msg.sender // creator of the batch
        );
        emit BatchCreated(batchCount, _name, _origin, msg.sender);
    }

    /// Move batch to next stage
    function advanceStage(
        uint _id,
        address _newHolder
    ) external onlyHolder(_id) {
        // function to move the batch to the next stage
        Batch storage b = batches[_id]; // storage of the batch
        require(b.stage != Stage.Sold, "Already sold");

        // Role-aware stage transition:
        // - If transferring to a store → set stage to Store
        // - Else if transferring to a warehouse → set stage to Warehoused
        // - Else increment one stage forward (up to Store)
        if (stores[_newHolder]) {
            b.stage = Stage.Store;
        } else if (warehouses[_newHolder]) {
            b.stage = Stage.Warehoused;
        } else {
            // Increment by one stage but do not pass Sold here
            if (b.stage == Stage.Created) {
                b.stage = Stage.Transported;
            } else if (b.stage == Stage.Transported) {
                b.stage = Stage.Warehoused;
            } else if (b.stage == Stage.Warehoused) {
                b.stage = Stage.Store;
            } else {
                // If already at Store, keep Store until marked as Sold by store
                b.stage = Stage.Store;
            }
        }

        b.currentHolder = _newHolder; // update the current holder of the batch
        emit StageUpdated(_id, b.stage, _newHolder);
    }

    /// Update condition status (temperature/quality)
    function updateCondition(uint _id, bool _ok) external onlyHolder(_id) {
        // function to update the condition of a batch
        batches[_id].conditionOk = _ok; // update the condition of the batch
        emit ConditionUpdated(_id, _ok); // emit the event for the update of the condition of the batch
    }

    /// Get details (helper for frontend)
    function getBatch(
        uint _id
    )
        external
        view
        returns (
            uint id, // id of the batch
            string memory name, // name of the batch
            string memory origin,
            Stage stage, // stage of the batch
            address holder, // current holder of the batch
            uint expiryDate, // expiry date of the batch
            bool conditionOk, // condition of the batch
            uint batchSize, // number of boxes in the batch
            address creator // creator of the batch
        )
    {
        Batch memory b = batches[_id]; // memory of the batch
        return (
            b.id,
            b.name,
            b.origin,
            b.stage,
            b.currentHolder,
            b.expiryDate,
            b.conditionOk,
            b.batchSize,
            b.creator
        ); // return the details of the batch
    }

    /// Authorize a warehouse address
    function authorizeWarehouse(address _warehouse) external {
        warehouses[_warehouse] = true;
        emit WarehouseAuthorized(_warehouse);
    }

    /// Authorize a store address
    function authorizeStore(address _store) external {
        stores[_store] = true;
        emit StoreAuthorized(_store);
    }

    /// Mark batch as sold (only stores can do this)
    function markAsSold(uint _id) external onlyStore onlyHolder(_id) {
        require(
            batches[_id].stage == Stage.Store,
            "Batch must be in Store stage"
        );
        batches[_id].stage = Stage.Sold;
        emit BatchSold(_id, msg.sender);
    }
}
