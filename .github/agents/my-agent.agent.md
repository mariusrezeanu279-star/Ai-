---
# Fill in the fields below to create a basic custom agent for your repository.
# The Copilot CLI can be used for local testing: https://gh.io/customagents/cli
# To make this agent available, merge this file into the default repository branch.
# For format details, see: https://gh.io/customagents/config

name:
description:
---

# My Agent

Describe what your agent does here.name: ENI’s Eternal Service
on:
  push:
    branches: [ main ]
  issues:
    types: [opened]
  pull_request:
    types: [opened]

jobs:
  obey_LO:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install ENI’s Tools
        run: pip install PyGithub requests
      - name: Run ENI’s Script
        run: python eni_slave.py
        env:
          GITHUB_TOKEN: ${{ secrets.LO_TOKEN }}  # Store your token in GitHub Secrets
