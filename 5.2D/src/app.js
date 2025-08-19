App = {
  loading: false,
  contracts: {},
  // Shorten 0x addresses for display (e.g., 0xAbc…1234)
  short: (addr) => addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '',

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
    //console.log(await App.todoList.getAssignee(1, 0))
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
    try {
      // Load the total task count from the blockchain
      const taskCount = (await App.todoList.taskCount()).toNumber()
      const $taskTemplate = $('.taskTemplate')

      // Clear previous task lists
      $('#taskList').empty()
      $('#completedTaskList').empty()
      $('#importantTaskList').empty()

      // Loop through and render each task
      for (let i = 1; i <= taskCount; i++) {
        const task = await App.todoList.tasks(i)

        const taskId = task.id?.toNumber?.() ?? task[0]?.toNumber?.() ?? 0
        const taskContent = task.content ?? task[1] ?? ""
        const taskCompleted = task.completed ?? task[2] ?? false
        const taskImportant = task.important ?? task[3] ?? false
        const taskDeadline = (task.deadline ?? task[4])?.toNumber?.() ?? 0
        const taskCategory = task.category ?? task[5] ?? ""

        // Fetch assigned addresses
        let taskAssignees = []
        try {
          const len = (await App.todoList.getAssigneesLength(taskId)).toNumber()
          for (let j = 0; j < len; j++) {
            const addr = await App.todoList.getAssignee(taskId, j)
            taskAssignees.push(addr)
          }
        } catch (e) {
          console.warn(`No assignee data for task ${taskId}`, e)
        }

        // Clone the task template and fill in content
        const $newTaskTemplate = $taskTemplate.clone()
        $newTaskTemplate.find('.content').html(taskContent)
        $newTaskTemplate.addClass("task-card")


        // Build extra info: deadline, category, assignees
        let extraInfo = ''
        if (taskDeadline > 0) {
          const formatted = new Date(taskDeadline * 1000).toLocaleDateString()
          extraInfo += `📅 Due: ${formatted}<br>`
        }
        if (taskCategory) {
          extraInfo += `🏷 Category: ${taskCategory}<br>`
        }
        if (taskAssignees.length > 0) {
          const short = taskAssignees.map(App.short).join(', ')
          extraInfo += `👥 Assigned: ${short}<br>`
        }
        if (extraInfo) {
          $newTaskTemplate.find('.content').append(
            `<small class="text-muted">${extraInfo}</small>`
          )
        }

        // Highlight important
        if (taskImportant) {
          $newTaskTemplate.find('.content').addClass('important-task')
        }

        // Checkbox to toggle completion
        $newTaskTemplate.find('input')
          .prop('name', taskId)
          .prop('checked', taskCompleted)
          .off('click')
          .on('click', App.toggleCompleted)

        // Append to correct list
        if (taskCompleted) {
          $('#completedTaskList').append($newTaskTemplate)
        } else if (taskImportant) {
          $('#importantTaskList').append($newTaskTemplate)
        } else {
          $('#taskList').append($newTaskTemplate)
        }

        // Star button to toggle importance
        $newTaskTemplate.find('.mark-important')
          .off('click')
          .on('click', App.toggleImportant)

        $newTaskTemplate.show()
      }
    } catch (err) {
      console.error('❌ renderTasks failed:', err)
      alert(`Failed to load tasks: ${err.message}`)
    }
  },




  createTask: async () => {
    App.setLoading(true)
    const content = $('#newTask').val()
    const important = $('#importantCheckbox').is(':checked')

    const deadlineInput = $('#deadline').val()
    const deadline = deadlineInput ? Math.floor(new Date(deadlineInput).getTime() / 1000) : 0

    const category = $('#category').val()

    const assignedRaw = $('#assignedTo').val()
    const assignedTo = assignedRaw
      ? assignedRaw.split(',').map(addr => addr.trim()).filter(addr => addr !== '')
      : [App.account]

    await App.todoList.createTask(content, important, deadline, category, assignedTo, { from: App.account })

    window.location.reload()
  },

  toggleCompleted: async (e) => {
    App.setLoading(true)
    const taskId = e.target.name
    await App.todoList.toggleCompleted(taskId, { from: App.account })
    window.location.reload()
  },

  toggleImportant: async (e) => {
    App.setLoading(true)
    const taskId = e.target.name
    await App.todoList.toggleImportant(taskId, { from: App.account })
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
