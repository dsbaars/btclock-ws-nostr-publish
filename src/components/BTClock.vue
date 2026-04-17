<script setup lang="ts">
import { inject, onMounted, ref, watch } from 'vue'
import {
    CURRENCY_AUD,
    CURRENCY_CAD,
    CURRENCY_EUR,
    CURRENCY_GBP,
    CURRENCY_JPY,
    CURRENCY_USD,
} from '../constants'

const Module = inject<any>('Module')

const props = defineProps<{
    method: string
    data: number
    params?: unknown[]
    title?: string
}>()

const characters = ref<string[]>([...'LOADING'])

function updateDisplay() {
    try {
        const ret = Module?.[props.method]?.(props.data, ...(props.params ?? []))
        if (ret) characters.value = [...ret]
    } catch {
        /* Module not yet ready; keep the LOADING placeholder. */
    }
}

watch(props, updateDisplay)
onMounted(updateDisplay)

const isSplitText = (s: string) => s.includes('/')

const currencySymbolMap: Record<string, string> = {
    [CURRENCY_EUR]: '€',
    [CURRENCY_GBP]: '£',
    [CURRENCY_JPY]: '¥',
    [CURRENCY_AUD]: '$',
    [CURRENCY_CAD]: '$',
    [CURRENCY_USD]: '$',
}
const renderChar = (c: string) =>
    c
        .split('')
        .map((ch) => currencySymbolMap[ch] ?? ch)
        .join('')
</script>

<template>
    <small class="block md:hidden text-center">{{ props.title }}</small>
    <div class="btclock" :class="{ tooltip: !!props.title }" :data-tip="props.title ?? ''">
        <template v-for="(c, i) in characters" :key="i">
            <div v-if="isSplitText(c)" class="splitText">
                <div class="flex-items" v-for="(part, j) in c.split('/')" :key="j">
                    {{ part }}
                </div>
            </div>
            <div v-else-if="c.length >= 3 && c === 'STS'" class="digit sats">S</div>
            <div v-else-if="c.length >= 3" class="mediumText">{{ renderChar(c) }}</div>
            <div v-else-if="c === ' ' || c === ''" class="mediumText">&nbsp;</div>
            <div v-else class="digit">{{ renderChar(c) }}</div>
        </template>
    </div>
</template>
