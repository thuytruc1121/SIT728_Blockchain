App = {
  loading: false,
  contracts: {},

  load: async () => {
    await App.loadWeb3()
    await App.loadAccount()
    await App.loadContract()
    await App.render()
  },

  // https://medium.com/metamask/https-medium-com-metamask-breaking-change-injecting-web3-7722797916a8
  loadWeb3: async () => {
    if (window.ethereum) {
      App.web3Provider = window.ethereum
      window.web3 = new Web3(window.ethereum)
      try {
        // Request account access
        await window.ethereum.request({ method: "eth_requestAccounts" })
      } catch (error) {
        console.error("User denied account access")
      }
    } else {
      console.log("Non-Ethereum browser detected. Install MetaMask!")
      alert("Please install MetaMask!")
    }
  },

  loadAccount: async () => {
    // Set the current blockchain account
    // console.log('use this account')
    // console.log(web3.eth.accounts)
    // App.account = web3.eth.accounts[0]
    // console.log('Account loaded at:', App.account)
    const accounts = await web3.eth.getAccounts()
    console.log("use these accounts:", accounts)

    if (accounts.length === 0) {
      console.error("❌ No accounts found. Is MetaMask unlocked?")
      alert("Please unlock MetaMask and connect an account")
      return
    }

    App.account = accounts[0]
    console.log("✅ Account loaded at:", App.account)
  },

  loadContract: async () => {
    // Create a JavaScript version of the smart contract
    const todoList = await $.getJSON('TodoList.json')
    App.contracts.TodoList = TruffleContract(todoList)
    App.contracts.TodoList.setProvider(App.web3Provider)
    App.todoList = await App.contracts.TodoList.deployed()
    console.log(App.todoList)
    console.log("✅ TodoList contract loaded at:", App.todoList.address)

  },

  render: async () => {
    // Prevent double render
    if (App.loading) {
      return
    }

    // Update app loading state
    App.setLoading(true)

    // Render Account
    $('#account').html(App.account)

    // Render Tasks
    await App.renderTasks()

    // Update loading state
    App.setLoading(false)
  },

  renderTasks: async () => {
    // Load the total task count from the blockchain
    const taskCount = await App.todoList.taskCount()
    const $taskTemplate = $('.taskTemplate')

    // Render out each task with a new task template
    for (var i = 1; i <= taskCount; i++) {
      // Fetch the task data from the blockchain
      const task = await App.todoList.tasks(i)
      const taskId = task[0].toNumber()
      const taskContent = task[1]
      const taskCompleted = task[2]

      // Create the html for the task
      const $newTaskTemplate = $taskTemplate.clone()
      $newTaskTemplate.find('.content').html(taskContent)
      $newTaskTemplate.find('input')
        .prop('name', taskId)
        .prop('checked', taskCompleted)
        .on('click', App.toggleCompleted)

      // Put the task in the correct list
      if (taskCompleted) {
        $('#completedTaskList').append($newTaskTemplate)
      } else {
        $('#taskList').append($newTaskTemplate)
      }

      // Show the task
      $newTaskTemplate.show()
    }
  },

  createTask: async () => {
    App.setLoading(true)
    const content = $('#newTask').val()
    await App.todoList.createTask(content, { from: App.account })
    window.location.reload()
  },

  toggleCompleted: async (e) => {
    App.setLoading(true)
    const taskId = e.target.name
    await App.todoList.toggleCompleted(taskId, { from: App.account })
    window.location.reload()
  },

  setLoading: (boolean) => {
    App.loading = boolean
    const loader = $('#loader')
    const content = $('#content')
    if (boolean) {
      loader.show()
      content.hide()
    } else {
      loader.hide()
      content.show()
    }
  }
}
ethereum.on("disconnect", () => {
  console.log("MetaMask disconnected")
})

$(() => {
  $(window).load(() => {
    App.load()
  })
})
