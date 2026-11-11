# Firebase Deployment Rule

When deploying Firebase functions, you MUST follow these steps to ensure the latest code is actually deployed:

1. **Verify Build Step:** Do not blindly run `npm run deploy` or `firebase deploy`. Check the `package.json` to verify if the `deploy` script automatically runs the `build` script.
2. **Compile First:** If the `deploy` script is not chained to the `build` script, you MUST explicitly run `npm run build` before deploying (e.g., `npm run build && npm run deploy`).
3. **Check Logs:** Do not assume a successful exit code (0) from the deploy command means the *new code* was deployed. If the code was not compiled first, Firebase will just upload a stale cache.
4. **Ensure Verification:** Always verify the build artifacts were correctly generated before confirming the deployment to the user.
