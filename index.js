// @ts-check
const core = require('@actions/core');
const github = require('@actions/github');
const _ = require('lodash');
const urljoin = require('url-join');

const badgeTemplate = _.template(
  [
    '[![kb-dep-badge--<%= name %>]',
    '(https://img.shields.io/badge/<%= left %>-<%= right %>-<%= color %>?logo=<%= logo %>)]',
    '(<%= url %>)'
  ].join('')
);

(async () => {
  try {
    const token = core.getInput('github-token', {required: true});
    const octokit = github.getOctokit(token);
    const { context } = github;

    const payload = JSON.stringify(github.context.payload, undefined, 2)
    console.log(`The event payload: ${payload}`);
    const DEPLOYMENT_URL = github.context.payload.deployment_status.deployment_url;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    console.log(DEPLOYMENT_URL);
    const deploymentData = await getDeploymentData();
    console.log(deploymentData.prRefs);
    const badgesData = [];
    ['badge3', 'badge2', 'badge' ].forEach((name) => {
      const badge = getBadgeDefinition(name);
      if (badge) {
        badgesData.push(badge);
      }
    });
    for (const prRef of deploymentData.prRefs) {
      if (prRef) {
        const prId = +prRef.ref.replace('refs/pull/', '').replace('/head', '');
        console.log({
          owner,
          repo,
          pull_number: prId
        });
        const pr = await octokit.pulls.get({
          owner,
          repo,
          pull_number: prId
        });
        console.log(pr);
        let body = pr.data.body;

        badgesData.forEach((badgeData, index) => {
          const compiledBadge = badgeTemplate(badgeData);
          if (pr.data.body.includes(badgeData.badgeId)) {
            // replace badge
            body = body.replace(badgeData.badgeCatchRegex, compiledBadge);
          } else {
            // add badge
            body = [
              index === 0 ? '\n\n' : ' ',
              `${pr.data.body}`
            ].join('');
          }
        });

        await octokit.pulls.update({
          owner,
          repo,
          pull_number: prId,
          body
        });
      }
    }

    const time = (new Date()).toTimeString();
    core.setOutput("time", time);

    async function getDeploymentData() {
      const deployment_id = +DEPLOYMENT_URL.replace(/^.*deployments\//, '');
      const deployment = await octokit.repos.getDeployment({
        owner,
        repo,
        deployment_id
      });
      const envUrl = deployment.data.payload.web_url;
      const commitRef = deployment.data.ref;
      const refs = await octokit.git.listMatchingRefs({
        owner,
        repo,
        ref: undefined
      });
      const prRefs = refs.data.filter((ref) => ref.object.sha === commitRef && ref.ref.startsWith('refs/pull/'));

      return {
        envUrl,
        prRefs
      };
    }

    function getBadgeDefinition(name) {
      const left = core.getInput(`${ name }-left`);
      const right = core.getInput(`${ name }-right`);
      const color = core.getInput(`${ name }-color`);
      const urlPath = core.getInput(`${ name }-path`);
      const logo = core.getInput(`${ name }-logo`);
      const badgeId = `kb-dep-badge--${ name }`;
      const badgeCatchRegex = new RegExp(`\\[!\\[${ badgeId }\\]\\(.*?\\)]\\(.*?\\)`);
    
      if (!left) {
        return;
      }
    
      return {
        name,
        left,
        right,
        color,
        url: urljoin(deploymentData.envUrl, urlPath),
        logo,
        badgeCatchRegex
      };
    }

  } catch (error) {
    core.setFailed(error.message);
  }
})();