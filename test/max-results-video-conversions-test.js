'use strict';

const test = require('ava');
const nock = require('nock');
const Promise = require('bluebird');

const provider = require('../');
const videoTransform = require('../lib/default-video-transform');
const formatReleaseDate = require('../lib/utils').formatReleaseDate;
const videoResponse = require('./fixtures/example-responses/get-video-response');
const conversionsResponse0 = require('./fixtures/example-responses/get-conversions-limit-offset-0');
const conversionsResponse3 = require('./fixtures/example-responses/get-conversions-limit-offset-3');
const helpers = require('./helpers');

const apiKey = 'fake-apiKey';
const secretKey = 'fake-secretKey';
const baseUrl = 'https://api.jwplatform.com';
const PATH_PREFIX = '/v1';

const type = 'videoSpec';

// mock channel fetching function
const channel = 'fake-channel';
const getChannel = () => {
	return Promise.resolve({
		id: channel,
		secrets: {
			apiKey,
			secretKey
		}
	});
};

let bus;
let videoHandler = null;

test.before(() => {
	nock(
		`${baseUrl}${PATH_PREFIX}`, {})
		.get(`/videos/show`)
		.query(params => {
			return params.video_key === '617kMdbG';
		})
		.reply(200, videoResponse);

	nock(
		`${baseUrl}${PATH_PREFIX}`, {})
		.get(`/videos/conversions/list`)
		.query(q => {
			return !q.result_offset;
		})
		.reply(200, conversionsResponse0);

	nock(
		`${baseUrl}${PATH_PREFIX}`, {})
		.get(`/videos/conversions/list`)
		.query(q => {
			return parseInt(q.result_offset, 10) === 0;
		})
		.reply(200, conversionsResponse0);

	nock(
		`${baseUrl}${PATH_PREFIX}`, {})
		.get(`/videos/conversions/list`)
		.query(q => {
			return parseInt(q.result_offset, 10) === 3;
		})
		.reply(200, conversionsResponse3);
});

test.beforeEach(() => {
	bus = helpers.createBus();

	// conversion results are for a maxResults of 3
	const client = provider.createClient({
		bus,
		apiKey,
		secretKey,
		maxResults: 3
	});

	videoHandler = provider.createVideoHandler(bus, getChannel, client, videoTransform);
});

test('when JWPlayer video found', t => {
	const spec = {
		channel,
		type,
		id: `spec-jwplayer-video-${videoResponse.video.key}`,
		video: {key: videoResponse.video.key}
	};

	return videoHandler({spec})
		.then(res => {
			t.deepEqual(Object.keys(res), [
				'id',
				'type',
				'title',
				'description',
				'images',
				'sources',
				'cast',
				'duration',
				'genres',
				'meta',
				'releaseDate',
				'tags'
			]);

			t.is(res.id, `res-jwplayer-video-${videoResponse.video.key}`);
			t.is(res.title, videoResponse.video.title);
			t.is(res.description, videoResponse.video.description);

			t.is(res.images.length, 6);
			t.is(res.sources.length, 6);

			t.is(res.duration, Math.round((videoResponse.video.duration || 0) * 1000));
			t.is(res.releaseDate, formatReleaseDate(videoResponse.video.date));
		});
});
