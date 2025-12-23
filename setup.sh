#!/bin/bash

# Echo Setup Script
echo "🔊 Setting up Echo..."

# Check Node.js version
required_node_version=18
current_node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)

if [ "$current_node_version" -lt "$required_node_version" ]; then
    echo "❌ Node.js version $required_node_version or higher is required"
    echo "   Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed"
    echo "   Install with: npm install -g pnpm"
    exit 1
fi

echo "✅ pnpm version: $(pnpm -v)"

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p src/{types,fetchers,parsers,calculators,metrics,categorization,scoring,exporters,utils}
mkdir -p tests/{unit,integration}
mkdir -p config
mkdir -p data/cache
mkdir -p exports
mkdir -p docs

echo "✅ Directory structure created"

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file (please add your HELIUS_API_KEY)"
else
    echo "ℹ️  .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create placeholder files
echo "📝 Creating placeholder files..."

# src/index.ts
cat > src/index.ts << 'EOF'
import 'dotenv/config';

export async function scoreWallet(address: string) {
  console.log(`Scoring wallet: ${address}`);
  // TODO: Implement wallet scoring
}

// For direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const testWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  console.log('🔊 Echo - Solana Wallet Scorer');
  console.log('===============================\n');
  scoreWallet(testWallet);
}
EOF

# src/cli.ts
cat > src/cli.ts << 'EOF'
#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('echo')
  .description('Solana wallet scoring system')
  .version('0.1.0');

program
  .command('score')
  .description('Score a wallet or multiple wallets')
  .option('-w, --wallet <address>', 'Score a single wallet')
  .option('-f, --file <path>', 'Score multiple wallets from file')
  .option('-d, --days <number>', 'Analysis period in days', '90')
  .option('-e, --export', 'Export results to file')
  .option('-o, --output <path>', 'Output file path')
  .action((options) => {
    console.log(chalk.blue('🔊 Echo - Wallet Scoring'));
    console.log(chalk.gray('Coming soon...'));
    console.log(chalk.yellow('\nOptions:'), options);
  });

program.parse();
EOF

chmod +x src/cli.ts

echo "✅ Placeholder files created"

# Run type check
echo "🔍 Running type check..."
pnpm run type-check

if [ $? -eq 0 ]; then
    echo "✅ Type check passed"
else
    echo "⚠️  Type check found issues (this is normal for now)"
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Add your HELIUS_API_KEY to .env file"
echo "  2. Run 'pnpm run dev' to test the setup"
echo "  3. Check docs/development.md for development guide"
echo ""
echo "Happy coding! 🚀"