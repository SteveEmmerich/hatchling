import inquirer from 'inquirer';

export async function conductOnboarding() {
  console.log("\n🎭 Let's define Hatchling's personality\n");

  // 1. Model Selection
  console.log('═'.repeat(70));
  console.log('STEP 1: Model Selection');
  console.log('═'.repeat(70) + '\n');

  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Choose AI model provider:',
      choices: [
        { name: '🦙 Ollama (Local - Free, Private)', value: 'ollama' },
        { name: '☁️  Anthropic (Cloud - Highest Quality)', value: 'anthropic' },
        { name: '☁️  OpenAI (Cloud)', value: 'openai' }
      ]
    }
  ]);

  let modelConfig: any;

  if (provider === 'ollama') {
    const { model } = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: 'Choose Ollama model:',
        choices: [
          { name: 'deepseek-r1:1.5b (Fastest - Good for Pi/Low RAM)', value: 'deepseek-r1:1.5b' },
          { name: 'llama3.1:8b (Balanced - Recommended)', value: 'llama3.1:8b' },
          { name: 'qwen2.5-coder:7b (Code-Focused)', value: 'qwen2.5-coder:7b' }
        ]
      }
    ]);
    
    modelConfig = {
      provider: 'ollama',
      model,
      baseUrl: 'http://localhost:11434/v1'
    };
  } else if (provider === 'anthropic') {
    modelConfig = {
      provider: 'anthropic',
      model: 'claude-sonnet-4'
    };
  } else {
    modelConfig = {
      provider: 'openai',
      model: 'gpt-4-turbo'
    };
  }

  // 2. Purpose
  console.log('\n' + '═'.repeat(70));
  console.log('STEP 2: Define Purpose');
  console.log('═'.repeat(70) + '\n');

  const { purpose } = await inquirer.prompt([
    {
      type: 'input',
      name: 'purpose',
      message: 'What should Hatchling\'s primary purpose be?',
      default: 'Coding assistant and autonomous developer',
      validate: (input: string) => input.length > 5 || 'Please provide more detail'
    }
  ]);

  console.log(`\n✅ Configuration selected:\n${JSON.stringify({ modelConfig, purpose }, null, 2)}`);
  return { modelConfig, purpose };
}

if (import.meta.main) {
  conductOnboarding().catch(console.error);
}
