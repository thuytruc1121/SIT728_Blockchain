const TodoList = artifacts.require('./TodoList.sol')

contract('TodoList', (accounts) => {
  before(async () => {
    this.todoList = await TodoList.deployed()
  })

  it('deploys successfully', async () => {
    const address = await this.todoList.address
    assert.notEqual(address, 0x0)
    assert.notEqual(address, '')
    assert.notEqual(address, null)
    assert.notEqual(address, undefined)
  })

  it('lists tasks', async () => {
    const taskCount = await this.todoList.taskCount()
    const task = await this.todoList.tasks(taskCount)
    assert.equal(task.id.toNumber(), taskCount.toNumber())
    assert.equal(task.content, 'Check out dappuniversity.com')
    assert.equal(task.completed, false)
    assert.equal(task.important, false)
    assert.equal(taskCount.toNumber(), 1)
  })

  it('creates tasks (regular tasks)', async () => {
    const result = await this.todoList.createTask(
      'A new task',
      false,
      0,                // deadline (0 = none)
      'Work',           // category
      [accounts[0]]     // assignedTo
    )

    const taskCount = await this.todoList.taskCount()
    assert.equal(taskCount, 2, 'taskCount increments')
    // check taskcreated event
    const event = result.logs[0].args
    assert.equal(event.id.toNumber(), 2)
    assert.equal(event.content, 'A new task', 'event content is correct')
    assert.equal(event.completed, false)
    assert.equal(event.important, false)

    //check storage
    const task = await this.todoList.tasks(2)
    assert.equal(task.content, 'A new task', 'stored  content is correct')
    assert.equal(task.completed, false)
    assert.equal(task.important, false)
  })

  it('creates tasks (important tasks)', async () => {
    const result = await this.todoList.createTask(
      'Important task',
      true,
      0,                // deadline
      'Urgent',         // category
      [accounts[0]]     // assignedTo
    )

    const taskCount = await this.todoList.taskCount()
    assert.equal(taskCount, 3, 'taskCount increments')
    // check taskcreated event
    const event = result.logs[0].args
    assert.equal(event.id.toNumber(), 3)
    assert.equal(event.content, 'Important task', 'event content is correct')
    assert.equal(event.completed, false)
    assert.equal(event.important, true)

    //check storage
    const task = await this.todoList.tasks(3)
    assert.equal(task.content, 'Important task', 'stored  content is correct')
    assert.equal(task.completed, false)
    assert.equal(task.important, true)
  })

  it('toggles task completion', async () => {
    const result = await this.todoList.toggleCompleted(1)
    const task = await this.todoList.tasks(1)
    assert.equal(task.completed, true)
    const event = result.logs[0].args
    assert.equal(event.id.toNumber(), 1)
    assert.equal(event.completed, true)
    assert.equal(task.important, false)
  })

  it('toggles task important', async () => {
    const result = await this.todoList.toggleImportant(2)
    const task = await this.todoList.tasks(2)
    assert.equal(task.important, true)
    const event = result.logs[0].args
    assert.equal(event.id.toNumber(), 2)
    assert.equal(task.completed, false)
    assert.equal(event.important, true)
  })

})
