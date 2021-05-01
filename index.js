// @ts-check
const core = require('@actions/core');
const github = require('@actions/github');
const _ = require('lodash');
const urljoin = require('url-join');

const style = core.getInput('style');
const badgeTemplate = _.template(
  [
    '[![kb-badger-action--<%= name %>]',
    '(https://img.shields.io/badge/<%= left %>-<%= right %>-<%= color %>',
    `?logo=<%= logo %>${ style ? '&style=' + style : '' })]`,
    '(<%= url %>)'
  ].join('')
);

(async () => {
  try {
    const token = core.getInput('github-token', { required: true });
    const shouldAddSeperator = core.getInput('separator').toLowerCase() === 'true';
    const position = core.getInput('position');
    const octokit = github.getOctokit(token);
    const { context } = github;
    const DEPLOYMENT_URL = github.context.payload.deployment_status.deployment_url;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    console.log(`processing deployment: ${ DEPLOYMENT_URL }`);
    const deploymentData = await getDeploymentData();

    // create the 3 badges data array
    const badgesData = [];
    ['badge3', 'badge2', 'badge'].forEach((name) => {
      const badge = getBadgeDefinition(name);
      if (badge) {
        badgesData.push(badge);
      }
    });

    // for each pull request reference containing the commit that got deployed,
    // change or add the badges based on the configuration
    for (const prRef of deploymentData.prRefs) {
      if (prRef) {
        const prId = +prRef.replace('refs/pull/', '').replace('/head', '');
        console.log(`Found Pull-Request pointing to the deployment: ${ owner }/${ repo }/${ prId }`);
        const pr = await octokit.pulls.get({
          owner,
          repo,
          pull_number: prId
        });
        let body = pr.data.body;

        badgesData.forEach((badgeData, index) => {
          const compiledBadge = badgeTemplate(badgeData);
          console.log(badgeData);
          if (pr.data.body.includes(badgeData.badgeId)) {
            console.log('Badge exists in PR body. Replacing with newer version');
            // replace badge
            body = body.replace(badgeData.badgeCatchRegex, compiledBadge);
          } else {
            console.log(`Badge Not found. Adding new one to body at ${ position }`);
            const seperator = shouldAddSeperator ?
              `${position === 'top' ? '\n' : '\n\n'}-----${position !== 'top' ? '\n' : '\n\n'}` :
              '\n\n';

            const newBody = [
              compiledBadge,
              index === 0 ? seperator : ' ',
              `${body}`
            ];

            if (position === 'top') {
              // add badge
              body = newBody.join('');
            } else {
              // add badge
              body = newBody.reverse().join('');
            }
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
      const prRefs = refs.data
        .filter((ref) => ref.object.sha === commitRef && ref.ref.startsWith('refs/pull/'))
        .map((prRef) => prRef.ref);

      return {
        envUrl,
        prRefs
      };
    }

    function getBadgeDefinition(name) {
      const left = encodeURIComponent(core.getInput(`${name}-left`).replace('-', '--').replace('_', '__'));
      const right = encodeURIComponent(core.getInput(`${name}-right`).replace('-', '--').replace('_', '__'));
      const color = core.getInput(`${name}-color`);
      const urlPath = core.getInput(`${name}-path`);
      const logo = core.getInput(`${name}-logo`);
      const badgeId = `kb-badger-action--${name}`;
      const badgeCatchRegex = new RegExp(`\\[!\\[${badgeId}\\]\\(.*?\\)]\\(.*?\\)`);

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
        badgeCatchRegex,
        badgeId
      };
    }

  } catch (error) {
    core.setFailed(error.message);
  }
})();