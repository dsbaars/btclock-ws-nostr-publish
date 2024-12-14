<script setup lang="ts">
import { inject, ref, onMounted, watch, useTemplateRef } from 'vue'
import { CURRENCY_EUR, CURRENCY_GBP, CURRENCY_JPY, CURRENCY_AUD, CURRENCY_CAD, CURRENCY_USD } from '../constants';
import { Tooltip } from 'bootstrap'

const Module = inject('Module')

const props = defineProps({
    method: String,
    data: Number,
    params: {
        type: Array,
        default: () => []
    },
    title: {
        type: String,
        required: false
    } 
})

let characters = ref();
let ret = "LOADING";

characters.value = [...ret];

const updateDisplay = () => {
    try {
        ret = Module[props.method](props.data, ...props.params);

        if (ret) {
            characters.value = [...ret];
        }
    }
    catch (e) {

    }
}

const component = useTemplateRef('component')


watch(props, updateDisplay);
onMounted(() => {
    updateDisplay()

    if (props.title && props.title.length) {
        new Tooltip(component.value)

        // if (tooltipTriggerList)
        //     Array.from(tooltipTriggerList).map(tooltipTriggerEl => new Tooltip(tooltipTriggerEl))
    }
});

const isSplitText = (str: string) => {
    return str.includes('/');
};


// Define a function that replaces characters with their currency symbols
function getCurrencySymbol(input: string): string {
    // Split the string into an array of characters to process each one
    return input.split('').map((char) => {
        switch (char) {
            case CURRENCY_EUR:
                return '€'; // Euro symbol
            case CURRENCY_GBP:
                return '£'; // Pound symbol
            case CURRENCY_JPY:
                return '¥'; // Yen symbol
            case CURRENCY_AUD:
            case CURRENCY_CAD:
            case CURRENCY_USD:
                return '$'; // Dollar symbol
            default:
                return char; // Return the original character if no match
        }
    }).join(''); // Join the array back into a string
}
</script>

<template>
    <small class="d-block d-md-none text-center">{{ props.title }}</small>
    <div class="btclock" data-bs-toggle="tooltip" data-bs-placement="top"
        :data-bs-title="props.title ? props.title : ''" ref="component">
        <template v-for="c in characters">
            <div v-if="isSplitText(c)" class="splitText">
                <div class="flex-items" v-for="part in c.split('/')">
                    {{ part }}
                </div>
            </div>
            <div v-else-if="c.length >= 3 && c == 'STS'" class="digit sats">S</div>

            <div v-else-if="c.length >= 3" class="mediumText">{{ getCurrencySymbol(c) }}</div>
            <div v-else-if="c === ' ' || c === ''" class="mediumText">&nbsp;</div>

            <div class="digit" v-else>{{ getCurrencySymbol(c) }}</div>
        </template>
    </div>
</template>