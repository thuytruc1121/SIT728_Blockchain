pragma solidity ^0.5.0;

contract TodoList {
    uint public taskCount = 0;

    struct Task {
        uint id;
        string content;
        bool completed;
        bool important; // new field
        uint deadline; //UNIX timestamp
        string category; // 'School', 'Work', 'Personal', 'Other'
        address[] assignedTo; // array of addresses
    }

    mapping(uint => Task) public tasks;

    event TaskCreated(
        uint id,
        string content,
        bool completed,
        bool important,
        uint deadline,
        string category,
        address[] assignedTo
    ); // updated event

    event TaskCompleted(uint id, bool completed);

    constructor() public {
        address[] memory self = new address[](1);
        self[0] = msg.sender;
        createTask("Check out dappuniversity.com", false, 0, "Work", self); //not important, no deadline, no category, assigned to self
    }
    event TaskMarkedImportant(uint id, bool important); // new event
    event TaskAssigned(uint id, address assignedTo); // new event
    event TaskDeadlineSet(uint id, uint deadline); // new event
    event TaskCategorySet(uint id, string category); // new event

    function createTask(
        string memory _content,
        bool _important,
        uint _deadline,
        string memory _category,
        address[] memory _assignedTo
    ) public {
        taskCount++;
        tasks[taskCount] = Task(
            taskCount,
            _content,
            false,
            _important,
            _deadline,
            _category,
            _assignedTo
        ); // add the important level
        emit TaskCreated(
            taskCount,
            _content,
            false,
            _important,
            _deadline,
            _category,
            _assignedTo
        ); // emit the new event
    }

    function toggleCompleted(uint _id) public {
        Task memory _task = tasks[_id];
        _task.completed = !_task.completed;
        tasks[_id] = _task;
        emit TaskCompleted(_id, _task.completed);
    }

    function toggleImportant(uint _id) public {
        // new function to toggle the important field
        Task memory _task = tasks[_id];
        _task.important = !_task.important;
        tasks[_id] = _task;
        emit TaskMarkedImportant(_id, _task.important);
    }
    function getAssigneesLength(uint id) external view returns (uint) {
        return tasks[id].assignedTo.length;
    }
    function getAssignee(uint id, uint idx) external view returns (address) {
        return tasks[id].assignedTo[idx];
    }
}
