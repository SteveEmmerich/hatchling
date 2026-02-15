#!/bin/bash
cd /tmp/test-hatch
echo "Testing guided prompts flow..."
echo ""
echo "When prompted, provide:"
echo "1. Provider: anthropic"
echo "2. Model: claude-3-5-sonnet"
echo "3. Name: TestBot"
echo "4. Purpose: To test the onboarding flow"
echo "5. Values: Safety, Transparency"
echo "6. Communication: Clear and concise"
echo "7. Your name: Tester"
echo "8. Your role: QA Engineer"
echo ""
/Users/sdemmer/Documents/Projects/startups/ozypy/hatch2/hatchling/hatchling-core/bin/hatchling init
