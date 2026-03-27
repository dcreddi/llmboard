# LLMBoard Project

## Before git push or Salesforce deploy

Before running `git push` or any Salesforce deploy command (`sf deploy`, `sfdx force:source:deploy`, etc.), always display:
- **Git:** current username (`git config user.name`), email (`git config user.email`), remote URL (`git remote get-url origin`), and current branch
- **Salesforce:** target org alias and instance URL (`sf org display` or `sfdx force:org:display`)

Show this info and confirm with the user before proceeding.
