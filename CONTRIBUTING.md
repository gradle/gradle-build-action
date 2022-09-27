### How to merge a Dependabot PR

The "distribution" for a GitHub Action is checked into the repository itself. 
In the case of the `gradle-build-action`, the transpiled sources are committed to the `dist` directory. 
Any production dependencies are inlined into the distribution. 
So if a Dependabot PR updates a production dependency (or a dev dependency that changes the distribution, like the Typescript compiler), 
then a manual step is required to rebuild the dist and commit.

The simplest process to follow is:
1. Checkout the dependabot branch locally eg: `git checkout dependabot/npm_and_yarn/actions/github-5.1.0`
2. Run `npm install` to download and the new dependencies and install locally
3. Run `npm run build` to regenerate the distribution
4. Push the changes to the dependabot branch
5. If/when the checks pass, you can merge the dependabot PR
