'use strict';

/**
 * Unit tests for src/validators/advisories.js
 * Tests the advisory_type custom validator and severity validator.
 */

const request = require('supertest');
const express = require('express');
const { handleValidationErrors } = require('../../src/middleware/validate');
const advisoryValidators = require('../../src/validators/advisories');

// Build a tiny Express app that uses the validators under test
function buildApp(validators) {
    const app = express();
    app.get('/test', validators, handleValidationErrors, (req, res) => {
        res.json({ success: true, query: req.query });
    });
    return app;
}

describe('advisoryValidators.getActive', () => {
    const app = buildApp(advisoryValidators.getActive);

    test('passes with valid severity', async () => {
        const res = await request(app).get('/test').query({ severity: 'Extreme' });
        expect(res.status).toBe(200);
    });

    test('passes with comma-separated severities', async () => {
        const res = await request(app).get('/test').query({ severity: 'Extreme,Severe' });
        expect(res.status).toBe(200);
    });

    test('rejects invalid severity', async () => {
        const res = await request(app).get('/test').query({ severity: 'InvalidSev' });
        expect(res.status).toBe(400);
    });

    test('passes with valid advisory_type', async () => {
        const res = await request(app).get('/test').query({ advisory_type: 'Tornado Warning' });
        expect(res.status).toBe(200);
    });

    test('rejects invalid advisory_type', async () => {
        const res = await request(app).get('/test').query({ advisory_type: 'Fake Alert Type' });
        expect(res.status).toBe(400);
    });

    test('passes with no params', async () => {
        const res = await request(app).get('/test');
        expect(res.status).toBe(200);
    });
});

describe('advisoryValidators.getAll', () => {
    const app = buildApp(advisoryValidators.getAll);

    test('rejects invalid status', async () => {
        const res = await request(app).get('/test').query({ status: 'bogus' });
        expect(res.status).toBe(400);
    });

    test('passes with valid status', async () => {
        const res = await request(app).get('/test').query({ status: 'active' });
        expect(res.status).toBe(200);
    });

    test('passes with comma-separated advisory_types', async () => {
        const res = await request(app).get('/test').query({ advisory_type: 'Tornado Warning,Flood Warning' });
        expect(res.status).toBe(200);
    });
});
