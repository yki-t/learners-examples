// API Endpoint を設定してください
const API_ENDPOINT = 'https://vncfve6wyb.execute-api.ap-northeast-1.amazonaws.com/prod/todos';

// エラー表示
function showError(message) {
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

// TODOを取得
async function fetchTodos() {
  try {
    const response = await fetch(API_ENDPOINT);
    if (!response.ok) throw new Error('Failed to fetch todos');
    const data = await response.json();
    renderTodos(data.items || []);
  } catch (error) {
    console.error('Error:', error);
    showError('TODOの取得に失敗しました');
  }
}

// TODOを表示
function renderTodos(todos) {
  const todoList = document.getElementById('todoList');
  todoList.innerHTML = '';

  todos.forEach(todo => {
    const li = document.createElement('li');
    li.className = `todo-item ${todo.completed ? 'completed' : ''}`;

    li.innerHTML = `
      <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleTodo('${todo.id}', ${!todo.completed})">
      <span>${todo.title}</span>
      <button class="delete" onclick="deleteTodo('${todo.id}')">削除</button>
    `;

    todoList.appendChild(li);
  });
}

// TODOを追加
async function addTodo() {
  const input = document.getElementById('todoInput');
  const title = input.value.trim();

  if (!title) return;

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title })
    });

    if (!response.ok) throw new Error('Failed to add todo');

    input.value = '';
    fetchTodos();
  } catch (error) {
    console.error('Error:', error);
    showError('TODOの追加に失敗しました');
  }
}

// TODOの完了状態を切り替え
async function toggleTodo(id, completed) {
  try {
    const response = await fetch(`${API_ENDPOINT}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ completed })
    });

    if (!response.ok) throw new Error('Failed to update todo');

    fetchTodos();
  } catch (error) {
    console.error('Error:', error);
    showError('TODOの更新に失敗しました');
  }
}

// TODOを削除
async function deleteTodo(id) {
  try {
    const response = await fetch(`${API_ENDPOINT}/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete todo');

    fetchTodos();
  } catch (error) {
    console.error('Error:', error);
    showError('TODOの削除に失敗しました');
  }
}

// Enterキーで追加
document.getElementById('todoInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addTodo();
  }
});

// 初期ロード
fetchTodos();
