import { z } from 'zod';

/*
 We are not able to put the validation in tool input schema itself because stricter clients like Gemini CLI doesn't treat email and urls as valid input types.
 Hence we have to accept them as strings and validate them here.
 */

export function validateEmail(email: string) {
    const emailSchema = z.string().email();
    const result = emailSchema.safeParse(email);
    if (result.success) {
        return null;
    } else {
        return `Invalid email passed ${email}`;
    }
}

export function validateUrls(urls: string[]) {
    const urlSchema = z.string().url();
    const invalidUrls = urls.filter(url => !urlSchema.safeParse(url).success);
    if (invalidUrls.length === 0) {
        return null;
    } else {
        return  `Invalid URL(s) passed: ${invalidUrls.join(', ')}`;
    }
}