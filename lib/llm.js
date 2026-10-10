'use strict';

const config = require('./config');

async function chatCompletion({ messages, tools }) {
  const url = config.baseUrl + '/chat/completions';
  const body = {
    model: config.model,
    messages,
    temperature: 0.2
  };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + config.apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('LLM 请求失败: ' + res.status + ' ' + text.slice(0, 200));
  }
  return res.json();
}

module.exports = { chatCompletion };
